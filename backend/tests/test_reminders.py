def test_defaults_are_off(client, register):
    reminders = client.get("/api/reminders", headers=register("sara")).json()
    assert [r["reminder_type"] for r in reminders] == ["mood_checkin", "study", "wellness"]
    assert all(r["is_enabled"] is False for r in reminders)


def test_set_and_change_reminder(client, register):
    sara, omar = register("sara"), register("omar")
    r = client.put("/api/reminders/mood_checkin", json={"remind_at": "21:15"}, headers=sara)
    assert r.status_code == 200
    mood = r.json()[0]
    assert mood["remind_at"] == "21:15:00" and mood["is_enabled"] is True

    client.put("/api/reminders/mood_checkin", json={"remind_at": "08:00", "is_enabled": False}, headers=sara)
    mood = client.get("/api/reminders", headers=sara).json()[0]
    assert mood["remind_at"] == "08:00:00" and mood["is_enabled"] is False

    # other users are not affected
    assert all(r["is_enabled"] is False for r in client.get("/api/reminders", headers=omar).json())
    assert client.get("/api/reminders", headers=omar).json()[0]["remind_at"] == "20:00:00"


def test_invalid_reminder(client, register):
    sara = register("sara")
    assert client.put("/api/reminders/sleep", json={"remind_at": "22:00"}, headers=sara).status_code == 422
    assert client.put("/api/reminders/study", json={"remind_at": "25:00"}, headers=sara).status_code == 422
