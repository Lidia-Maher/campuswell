/** PHQ-9 and GAD-7, standard published wording (free to use; developed by Drs. Spitzer, Williams, Kroenke and colleagues). */
export type QuestionnaireType = "PHQ9" | "GAD7";

export const ANSWERS = ["Not at all", "Several days", "More than half the days", "Nearly every day"];

export const QUESTIONNAIRES: Record<QuestionnaireType, { name: string; about: string; max: number; questions: string[] }> = {
  PHQ9: {
    name: "PHQ-9",
    about: "Mood and depression symptoms",
    max: 27,
    questions: [
      "Little interest or pleasure in doing things",
      "Feeling down, depressed, or hopeless",
      "Trouble falling or staying asleep, or sleeping too much",
      "Feeling tired or having little energy",
      "Poor appetite or overeating",
      "Feeling bad about yourself, or that you are a failure or have let yourself or your family down",
      "Trouble concentrating on things, such as reading or watching television",
      "Moving or speaking so slowly that other people could have noticed, or the opposite: being so fidgety or restless that you have been moving around a lot more than usual",
      "Thoughts that you would be better off dead, or of hurting yourself in some way",
    ],
  },
  GAD7: {
    name: "GAD-7",
    about: "Anxiety and worry",
    max: 21,
    questions: [
      "Feeling nervous, anxious, or on edge",
      "Not being able to stop or control worrying",
      "Worrying too much about different things",
      "Trouble relaxing",
      "Being so restless that it is hard to sit still",
      "Becoming easily annoyed or irritable",
      "Feeling afraid, as if something awful might happen",
    ],
  },
};

export const SEVERITY: Record<string, { label: string; badge: string; text: string }> = {
  minimal: { label: "Minimal", badge: "badge-green", text: "Your answers suggest few or no symptoms right now." },
  mild: { label: "Mild", badge: "badge-blue", text: "Your answers suggest mild symptoms. Keep looking after yourself and check in again in two weeks." },
  moderate: { label: "Moderate", badge: "badge-warning", text: "Your answers suggest moderate symptoms. Talking to someone you trust or a counsellor can help." },
  moderately_severe: { label: "Moderately severe", badge: "badge-danger", text: "Your answers suggest significant symptoms. We recommend talking to a counsellor." },
  severe: { label: "Severe", badge: "badge-danger", text: "Your answers suggest severe symptoms. Please talk to a counsellor soon." },
};
