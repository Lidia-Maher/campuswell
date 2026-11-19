// Guided meditations: timed steps shown on screen and, if the browser can, read aloud.
// Content rows point at them with media_url "builtin:<key>".

export type Step = { at: number; text: string }; // `at` = seconds from the start

export const MEDITATIONS: Record<string, Step[]> = {
  "body-scan": [
    { at: 0, text: "Lie down or sit comfortably. Let your eyes close, and let your arms rest by your sides." },
    { at: 30, text: "Take three slow breaths. In through your nose, and out through your mouth. Let each breath out be a little longer." },
    { at: 75, text: "Bring your attention to your feet. Notice any warmth, coolness or tension there. Let them grow heavy and soft." },
    { at: 130, text: "Move up to your calves and knees. If you find tightness, breathe into it, and let it go as you breathe out." },
    { at: 185, text: "Notice your thighs and hips, resting on the bed or chair. Let the surface hold all of your weight." },
    { at: 240, text: "Bring your attention to your belly. Feel it rise as you breathe in, and fall as you breathe out." },
    { at: 295, text: "Move to your chest and upper back. Let your shoulders drop away from your ears." },
    { at: 350, text: "Notice your arms, from your shoulders down to your fingertips. Let your hands become loose and still." },
    { at: 405, text: "Bring your attention to your neck and jaw. Unclench your teeth, and let your tongue rest." },
    { at: 455, text: "Soften the muscles around your eyes and across your forehead. Let your whole face relax." },
    { at: 510, text: "Now feel your whole body at once, heavy, warm and calm. There is nothing you need to do right now." },
    { at: 565, text: "Keep breathing slowly. If you are going to sleep, simply let yourself drift. Otherwise, gently open your eyes." },
  ],
  "exam-calm": [
    { at: 0, text: "Sit upright with both feet flat on the floor. Rest your hands on your knees." },
    { at: 20, text: "Breathe in slowly for four counts. One, two, three, four. And breathe out for six counts." },
    { at: 60, text: "Feeling nervous before an exam is normal. It means this matters to you, and your body is getting ready." },
    { at: 105, text: "Notice where you feel the stress. Maybe your chest, your stomach or your shoulders. Breathe gently into that place." },
    { at: 155, text: "Remind yourself: I have prepared. I will read each question carefully. If I get stuck, I will move on and come back." },
    { at: 210, text: "Picture yourself sitting in the exam room, calm and focused, reading the first question with a clear mind." },
    { at: 255, text: "Take one more deep breath in, and let it all the way out. When you are ready, open your eyes. You've got this." },
  ],
  "study-break": [
    { at: 0, text: "Push your chair back from your desk and look away from the screen. Let your eyes rest on something far away." },
    { at: 30, text: "Roll your shoulders back slowly, three times. Then let them drop." },
    { at: 70, text: "Close your eyes and take a few natural breaths. Don't change them, just notice them." },
    { at: 120, text: "Your mind may still be on what you were studying. That's fine. Each time you notice a thought, let it pass, and come back to the breath." },
    { at: 190, text: "Listen to the sounds around you. Near sounds, and far sounds. Let them come and go." },
    { at: 250, text: "Notice how your body feels after sitting for a long time. Gently stretch anything that feels stiff." },
    { at: 310, text: "Before you go back, choose one small thing you will focus on next. Just one." },
    { at: 370, text: "Take a deep breath in, and out. Open your eyes, drink some water, and start again with a fresh mind." },
  ],
  grounding: [
    { at: 0, text: "This exercise helps when anxiety feels overwhelming. Wherever you are, sit or stand still for a moment." },
    { at: 20, text: "Take a slow breath in, and a long breath out." },
    { at: 35, text: "Look around and name five things you can see. Take your time with each one." },
    { at: 75, text: "Now notice four things you can feel. Your feet on the floor, your clothes, the air on your skin." },
    { at: 115, text: "Listen for three things you can hear." },
    { at: 150, text: "Notice two things you can smell. If you can't smell anything, think of two smells you like." },
    { at: 185, text: "Notice one thing you can taste." },
    { at: 205, text: "Take one more slow breath. You are here, and you are safe right now. If these feelings keep coming back, please talk to someone you trust or the university counselling service." },
  ],
};

export const MEDITATION_NAMES: Record<string, string> = {
  "body-scan": "Body scan for sleep",
  "exam-calm": "Exam calm",
  "study-break": "Mindful study break",
  grounding: "5-4-3-2-1 grounding",
};

export const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

function calmVoice(): SpeechSynthesisVoice | undefined {
  const english = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  return english.find((v) => /natural|aria|jenny|libby|sonia|samantha|google uk english female/i.test(v.name)) ?? english[0];
}

export function speak(text: string) {
  if (!canSpeak) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = calmVoice();
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "en-US";
  u.rate = 0.85;
  u.pitch = 0.95;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (canSpeak) speechSynthesis.cancel();
}
