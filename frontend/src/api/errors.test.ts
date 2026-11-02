import { ApiError, messageFor, toApiError } from "./errors";

describe("toApiError", () => {
  it("reads our own error codes", () => {
    const e = toApiError(403, { detail: "not_registered" });
    expect(e.status).toBe(403);
    expect(e.code).toBe("not_registered");
  });

  it("reads field validation errors", () => {
    const e = toApiError(422, {
      detail: [{ loc: ["body", "mood"], msg: "Input should be less than or equal to 5" }],
    });
    expect(e.code).toBe("validation_error");
    expect(e.fieldErrors).toEqual([{ field: "mood", message: "Input should be less than or equal to 5" }]);
  });

  it("strips pydantic's 'Value error' prefix", () => {
    const e = toApiError(422, { detail: [{ loc: ["body"], msg: "Value error, PHQ9 needs exactly 9 answers" }] });
    expect(e.fieldErrors[0].message).toBe("PHQ9 needs exactly 9 answers");
  });

  it("handles bodies that are not ours", () => {
    expect(toApiError(502, "Bad Gateway").code).toBe("server_error");
    expect(toApiError(418, undefined).code).toBe("unknown_error");
  });
});

describe("messageFor", () => {
  it("gives a readable message for known codes", () => {
    expect(messageFor(new ApiError(429, "post_limit_reached"))).toBe("You can share up to 10 posts a day.");
  });
  it("falls back for unknown codes and non-API errors", () => {
    expect(messageFor(new ApiError(400, "something_new"))).toBe("Something went wrong. Please try again.");
    expect(messageFor(new Error("boom"))).toBe("Something went wrong. Please try again.");
  });
  it("shows a single field error directly", () => {
    const e = toApiError(422, { detail: [{ loc: ["body", "title"], msg: "String should have at least 1 character" }] });
    expect(messageFor(e)).toBe("String should have at least 1 character");
  });
});
