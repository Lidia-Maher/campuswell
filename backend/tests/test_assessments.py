def test_phq9_score_and_severity(client, register):
    headers = register("sara")
    r = client.post("/api/assessments", json={"assessment_type": "PHQ9",
                                              "answers": [2, 2, 2, 2, 2, 2, 2, 2, 0]}, headers=headers)
    assert r.status_code == 201
    result = r.json()
    assert result["total_score"] == 16
    assert result["severity"] == "moderately_severe"
    assert result["needs_support_message"] is False
    assert result["recommend_counselling"] is True


def test_question_9_flags_even_a_low_score(client, register):
    headers = register("sara")
    result = client.post("/api/assessments", json={"assessment_type": "PHQ9",
                                                   "answers": [0, 0, 0, 0, 0, 0, 0, 0, 1]},
                         headers=headers).json()
    assert result["severity"] == "minimal" and result["needs_support_message"] is True
    assert result["recommend_counselling"] is False


def test_gad7(client, register):
    headers = register("sara")
    result = client.post("/api/assessments", json={"assessment_type": "GAD7",
                                                   "answers": [1, 1, 1, 1, 1, 1, 3]},
                         headers=headers).json()
    # question 7 of GAD-7 is not a safety question
    assert result["total_score"] == 9 and result["severity"] == "mild"
    assert result["needs_support_message"] is False


def test_incomplete_or_invalid_answers_are_rejected(client, register):
    headers = register("sara")
    for body in [
        {"assessment_type": "PHQ9", "answers": [0] * 8},  # question 9 missing
        {"assessment_type": "PHQ9", "answers": [0] * 10},
        {"assessment_type": "GAD7", "answers": [0] * 9},
        {"assessment_type": "GAD7", "answers": [0, 0, 0, 0, 0, 0, 4]},
        {"assessment_type": "BDI", "answers": [0] * 9},
    ]:
        assert client.post("/api/assessments", json=body, headers=headers).status_code == 422
    assert client.get("/api/assessments", headers=headers).json() == []


def test_history_and_detail(client, register):
    sara, omar = register("sara"), register("omar")
    client.post("/api/assessments", json={"assessment_type": "GAD7", "answers": [0] * 7}, headers=sara)
    phq = client.post("/api/assessments", json={"assessment_type": "PHQ9",
                                                "answers": [1, 2, 3, 0, 1, 2, 3, 0, 0]}, headers=sara).json()

    history = client.get("/api/assessments", headers=sara).json()
    assert [a["assessment_type"] for a in history] == ["PHQ9", "GAD7"]  # newest first
    assert len(client.get("/api/assessments?type=GAD7", headers=sara).json()) == 1

    detail = client.get(f"/api/assessments/{phq['assessment_id']}", headers=sara).json()
    assert detail["answers"] == [1, 2, 3, 0, 1, 2, 3, 0, 0] and detail["total_score"] == 12

    assert client.get("/api/assessments", headers=omar).json() == []
    assert client.get(f"/api/assessments/{phq['assessment_id']}", headers=omar).status_code == 404
