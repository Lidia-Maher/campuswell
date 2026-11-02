/**
 * Who students are pointed to when they may need help (PHQ-9 question 9, high scores,
 * the support tip, the Campus Resources tab).
 *
 * TODO(team): fill in the real, verified contact details before any real student uses
 * CampusWell. Confirm them with the PSUT Deanship of Student Affairs / counselling office.
 * Leave a value as null until it is confirmed: the screens then say the detail is missing
 * instead of showing a wrong number.
 */
export type SupportContact = {
  name: string;
  description: string;
  phone: string | null;
  email: string | null;
  location: string | null;
  hours: string | null;
};

export const SUPPORT_CONTACTS: SupportContact[] = [
  {
    name: "PSUT Counselling Office",
    description: "Free, confidential support for PSUT students from professional counsellors.",
    phone: null,
    email: null,
    location: null,
    hours: null,
  },
  {
    name: "Emergency services in Jordan",
    description: "If you or someone else is in immediate danger, call emergency services now.",
    phone: "911",
    email: null,
    location: null,
    hours: "24 hours",
  },
];
