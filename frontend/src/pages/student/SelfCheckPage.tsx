import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardCheck, HeartPulse, Info } from "lucide-react";
import { type FormEvent, useState } from "react";

import { api, type Schemas, unwrap } from "../../api/client";
import { messageFor } from "../../api/errors";
import { useAssessments } from "../../api/hooks";
import { SupportPanel } from "../../components/SupportPanel";
import { Alert, Button, Card, Empty, ErrorAlert, Loading } from "../../components/ui";
import { whenLabel } from "../../lib/format";
import { ANSWERS, QUESTIONNAIRES, type QuestionnaireType, SEVERITY } from "../../lib/questionnaires";

type Result = Schemas["AssessmentResult"];

const DISCLAIMER = "This is a self-check, not a diagnosis. Only a qualified professional can assess your mental health.";

function Questionnaire({ type, onDone, onCancel }: { type: QuestionnaireType; onDone: (r: Result) => void; onCancel: () => void }) {
  const q = QUESTIONNAIRES[type];
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<(number | null)[]>(q.questions.map(() => null));
  const submit = useMutation({
    mutationFn: () => unwrap(api.POST("/api/assessments", { body: { assessment_type: type, answers: answers as number[] } })),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["assessments"] });
      void qc.invalidateQueries({ queryKey: ["suggestions"] });
      onDone(r);
    },
  });
  const answered = answers.filter((a) => a !== null).length;

  return (
    <form className="stack-lg" onSubmit={(e: FormEvent) => { e.preventDefault(); submit.mutate(); }}>
      <div className="row spread">
        <Button variant="quiet" icon={ArrowLeft} onClick={onCancel}>Back</Button>
        <span className="badge badge-blue">{answered} of {q.questions.length} answered</span>
      </div>
      <Card title={q.name} subtitle="Over the last 2 weeks, how often have you been bothered by any of the following problems?">
        <ol className="stack" style={{ paddingLeft: 0, listStyle: "none", gap: 18 }}>
          {q.questions.map((text, i) => (
            <li key={i}>
              <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
                <legend style={{ fontWeight: 600, color: "#111827", marginBottom: 10 }}>{i + 1}. {text}</legend>
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                  {ANSWERS.map((label, score) => {
                    const id = `${type}-${i}-${score}`;
                    const selected = answers[i] === score;
                    return (
                      <label key={score} htmlFor={id} className="row" style={{
                        gap: 8, padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                        border: `1.5px solid ${selected ? "#2e75b6" : "#e5e9f0"}`, background: selected ? "#eaf2fa" : "#fff",
                      }}>
                        <input type="radio" id={id} name={`${type}-${i}`} checked={selected}
                               onChange={() => setAnswers((a) => a.map((v, j) => (j === i ? score : v)))}
                               style={{ accentColor: "#2e75b6" }} />
                        <span className="small">{label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </li>
          ))}
        </ol>
      </Card>
      {submit.isError && <Alert>{messageFor(submit.error)}</Alert>}
      <p className="small muted">{DISCLAIMER}</p>
      <Button type="submit" size="lg" busy={submit.isPending} disabled={answered < q.questions.length}>See my result</Button>
    </form>
  );
}

function ResultView({ result, onBack }: { result: Result; onBack: () => void }) {
  const q = QUESTIONNAIRES[result.assessment_type as QuestionnaireType];
  const sev = SEVERITY[result.severity];
  return (
    <div className="stack-lg">
      {result.needs_support_message && <SupportPanel urgent />}
      <Card title={`Your ${q.name} result`} subtitle={whenLabel(result.taken_at)}>
        <div className="stack">
          <div className="row wrap" style={{ gap: 16 }}>
            <span className="num" style={{ fontSize: "2.6rem", fontWeight: 700, color: "#111827" }}>
              {result.total_score}<span className="muted" style={{ fontSize: "1.2rem" }}> / {q.max}</span>
            </span>
            <span className={`badge ${sev.badge}`} style={{ fontSize: "0.9rem" }}>{sev.label}</span>
          </div>
          <p>{sev.text}</p>
          {result.recommend_counselling && !result.needs_support_message && (
            <Alert kind="warning">Talking to a counsellor could really help. It's free and confidential for PSUT students.</Alert>
          )}
          <p className="small muted row" style={{ gap: 6 }}><Info size={14} aria-hidden /> {DISCLAIMER}</p>
        </div>
      </Card>
      {result.recommend_counselling && !result.needs_support_message && <SupportPanel />}
      <Button variant="secondary" icon={ArrowLeft} onClick={onBack}>Back to self-checks</Button>
    </div>
  );
}

export function SelfCheckPage() {
  const history = useAssessments(20);
  const [taking, setTaking] = useState<QuestionnaireType | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  if (result) return <ResultView result={result} onBack={() => setResult(null)} />;
  if (taking) return <Questionnaire type={taking} onCancel={() => setTaking(null)} onDone={(r) => { setTaking(null); setResult(r); }} />;

  const last = (type: QuestionnaireType) => history.data?.find((a) => a.assessment_type === type);

  return (
    <div className="stack-lg">
      <div>
        <h2 style={{ fontSize: "1.6rem" }}>Self-Check</h2>
        <p className="muted">Two short, widely used questionnaires. Taking them every two weeks helps you see how you're doing.</p>
      </div>
      <div className="grid grid-half">
        {(Object.keys(QUESTIONNAIRES) as QuestionnaireType[]).map((type) => {
          const q = QUESTIONNAIRES[type];
          const prev = last(type);
          return (
            <Card key={type} title={<span className="row"><HeartPulse size={20} color="#2e75b6" aria-hidden /> {q.name}</span>}
                  subtitle={`${q.about} · ${q.questions.length} questions · about 2 minutes`}>
              <div className="stack">
                <p className="small muted">
                  {prev ? <>Last result: <strong>{prev.total_score}/{q.max}</strong> ({SEVERITY[prev.severity].label.toLowerCase()}), {whenLabel(prev.taken_at)}</>
                        : "You haven't taken this one yet."}
                </p>
                <Button icon={ClipboardCheck} onClick={() => setTaking(type)}>Start {q.name}</Button>
              </div>
            </Card>
          );
        })}
      </div>
      <Card title="Your history">
        {history.isPending ? <Loading /> : history.isError ? <ErrorAlert error={history.error} /> :
          history.data.length === 0 ? <Empty>Your results will appear here.</Empty> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Questionnaire</th><th className="num">Score</th><th>Level</th></tr></thead>
                <tbody>
                  {history.data.map((a) => {
                    const q = QUESTIONNAIRES[a.assessment_type as QuestionnaireType];
                    return (
                      <tr key={a.assessment_id}>
                        <td>{whenLabel(a.taken_at)}</td>
                        <td>{q.name}</td>
                        <td className="num">{a.total_score} / {q.max}</td>
                        <td><span className={`badge ${SEVERITY[a.severity].badge}`}>{SEVERITY[a.severity].label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </div>
  );
}
