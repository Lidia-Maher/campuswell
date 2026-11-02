/**
 * Errors from the backend arrive as {"detail": "some_code"} (our own errors) or
 * {"detail": [{loc, msg}, ...]} (422: a field failed validation).
 */

export type FieldError = { field: string; message: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public fieldErrors: FieldError[] = [],
  ) {
    super(code);
    this.name = "ApiError";
  }
}

type ValidationItem = { loc?: (string | number)[]; msg?: string };

export function toApiError(status: number, body: unknown): ApiError {
  const detail = (body as { detail?: unknown } | undefined)?.detail;
  if (typeof detail === "string") return new ApiError(status, detail);
  if (Array.isArray(detail)) {
    const fieldErrors = (detail as ValidationItem[]).map((item) => ({
      field: String(item.loc?.[item.loc.length - 1] ?? ""),
      message: (item.msg ?? "Invalid value").replace(/^Value error, /, ""),
    }));
    return new ApiError(status, "validation_error", fieldErrors);
  }
  return new ApiError(status, status >= 500 ? "server_error" : "unknown_error");
}

// What the user sees for each backend error code
const MESSAGES: Record<string, string> = {
  network_error: "Can't reach CampusWell. Check your connection. If the server was asleep, try again in a minute.",
  server_error: "Something went wrong on our side. Please try again.",
  unknown_error: "Something went wrong. Please try again.",
  validation_error: "Some fields need fixing.",
  missing_token: "Please sign in.",
  invalid_token: "Your session is no longer valid. Please sign in again.",
  token_expired: "Your session expired. Please sign in again.",
  not_registered: "Finish creating your profile to continue.",
  account_deactivated: "Your account has been deactivated. Contact the CampusWell administrator.",
  email_not_verified: "Verify your email first: click the link we sent you.",
  email_domain_not_allowed: "Use your university email (@std.psut.edu.jo).",
  email_required: "Your account has no email address.",
  already_registered: "This account is already registered.",
  email_in_use: "This email is already used by another account.",
  forbidden: "You don't have access to this page.",
  not_found: "This item doesn't exist or was removed.",
  post_limit_reached: "You can share up to 10 posts a day.",
  already_reported: "You already reported this post.",
  cannot_report_own_post: "You can't report your own post.",
  already_resolved: "This report was already handled.",
  cannot_change_own_account: "You can't change your own account here.",
  student_needs_department: "Students must have a school.",
  no_suggestions_available: "No tips available yet.",
};

export function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "validation_error" && error.fieldErrors.length === 1) {
      return error.fieldErrors[0].message;
    }
    return MESSAGES[error.code] ?? MESSAGES.unknown_error;
  }
  return MESSAGES.unknown_error;
}
