def _approved_post(client, author: dict, admin: dict, content: str = "Good luck with exams!") -> int:
    post_id = client.post("/api/posts", json={"content": content}, headers=author).json()["post_id"]
    r = client.post(f"/api/admin/posts/{post_id}/review", json={"decision": "approve"}, headers=admin)
    assert r.status_code == 200
    return post_id


def test_new_posts_wait_for_approval(client, register, register_staff):
    sara, omar, admin = register("sara"), register("omar"), register_staff("admin")
    r = client.post("/api/posts", json={"content": "  Hello campus  "}, headers=sara)
    assert r.status_code == 201 and r.json()["status"] == "pending" and r.json()["content"] == "Hello campus"
    post_id = r.json()["post_id"]

    assert client.get("/api/posts", headers=omar).json() == []
    assert [p["post_id"] for p in client.get("/api/admin/posts", headers=admin).json()] == [post_id]

    client.post(f"/api/admin/posts/{post_id}/review", json={"decision": "approve"}, headers=admin)
    feed = client.get("/api/posts", headers=omar).json()
    assert feed[0]["author_name"] == "Sara" and feed[0]["is_mine"] is False
    assert client.get("/api/admin/posts", headers=admin).json() == []


def test_rejected_post_shows_reason_to_author(client, register, register_staff):
    sara, admin = register("sara"), register_staff("admin")
    post_id = client.post("/api/posts", json={"content": "Selling books"}, headers=sara).json()["post_id"]
    # a reason is required to reject
    assert client.post(f"/api/admin/posts/{post_id}/review", json={"decision": "reject"},
                       headers=admin).status_code == 422
    client.post(f"/api/admin/posts/{post_id}/review",
                json={"decision": "reject", "rejection_reason": "Advertising"}, headers=admin)
    mine = client.get("/api/posts/mine", headers=sara).json()
    assert mine[0]["status"] == "rejected" and mine[0]["rejection_reason"] == "Advertising"
    assert client.get("/api/posts", headers=sara).json() == []


def test_post_validation_and_permissions(client, register):
    sara = register("sara")
    assert client.post("/api/posts", json={"content": "   "}, headers=sara).status_code == 422
    assert client.post("/api/posts", json={"content": "x" * 501}, headers=sara).status_code == 422
    # students cannot moderate
    assert client.get("/api/admin/posts", headers=sara).status_code == 403
    assert client.get("/api/admin/reports", headers=sara).status_code == 403


def test_likes(client, register, register_staff):
    sara, omar, admin = register("sara"), register("omar"), register_staff("admin")
    post_id = _approved_post(client, sara, admin)

    assert client.put(f"/api/posts/{post_id}/like", headers=omar).status_code == 204
    assert client.put(f"/api/posts/{post_id}/like", headers=omar).status_code == 204  # twice is fine
    client.put(f"/api/posts/{post_id}/like", headers=sara)
    post = client.get("/api/posts", headers=omar).json()[0]
    assert post["like_count"] == 2 and post["liked_by_me"] is True

    client.delete(f"/api/posts/{post_id}/like", headers=omar)
    post = client.get("/api/posts", headers=omar).json()[0]
    assert post["like_count"] == 1 and post["liked_by_me"] is False

    # cannot like a post that is not in the feed
    pending = client.post("/api/posts", json={"content": "Pending"}, headers=sara).json()["post_id"]
    assert client.put(f"/api/posts/{pending}/like", headers=omar).status_code == 404


def test_report_and_take_action(client, register, register_staff):
    sara, omar, lina, admin = register("sara"), register("omar"), register("lina"), register_staff("admin")
    post_id = _approved_post(client, sara, admin)

    assert client.post(f"/api/posts/{post_id}/report", json={"reason": "Rude"}, headers=sara).status_code == 400
    assert client.post(f"/api/posts/{post_id}/report", json={"reason": "Rude"}, headers=omar).status_code == 201
    assert client.post(f"/api/posts/{post_id}/report", json={"reason": "Again"}, headers=omar).status_code == 409
    client.post(f"/api/posts/{post_id}/report", json={"reason": "Spam"}, headers=lina)

    reported = client.get("/api/admin/posts?status=approved&reported_only=true", headers=admin).json()
    assert reported[0]["open_reports"] == 2

    reports = client.get("/api/admin/reports", headers=admin).json()
    assert len(reports) == 2
    r = client.post(f"/api/admin/reports/{reports[0]['report_id']}/resolve",
                    json={"resolution": "action_taken"}, headers=admin)
    assert r.status_code == 204

    # the post is removed and both reports are closed
    assert client.get("/api/posts", headers=omar).json() == []
    assert client.get("/api/admin/reports", headers=admin).json() == []
    assert len(client.get("/api/admin/reports?status=action_taken", headers=admin).json()) == 2
    assert client.post(f"/api/admin/reports/{reports[1]['report_id']}/resolve",
                       json={"resolution": "dismissed"}, headers=admin).status_code == 409


def test_dismiss_report_keeps_post(client, register, register_staff):
    sara, omar, admin = register("sara"), register("omar"), register_staff("admin")
    post_id = _approved_post(client, sara, admin)
    report_id = client.post(f"/api/posts/{post_id}/report", json={"reason": "?"}, headers=omar).json()["report_id"]
    client.post(f"/api/admin/reports/{report_id}/resolve", json={"resolution": "dismissed"}, headers=admin)
    assert len(client.get("/api/posts", headers=omar).json()) == 1


def test_delete_post(client, register, register_staff):
    sara, omar, admin = register("sara"), register("omar"), register_staff("admin")
    first = _approved_post(client, sara, admin, "First")
    second = _approved_post(client, sara, admin, "Second")
    assert client.delete(f"/api/posts/{first}", headers=omar).status_code == 404
    assert client.delete(f"/api/posts/{first}", headers=sara).status_code == 204
    assert client.delete(f"/api/posts/{second}", headers=admin).status_code == 204
    assert client.get("/api/posts", headers=omar).json() == []


def test_feed_paging(client, register, register_staff):
    sara, admin = register("sara"), register_staff("admin")
    ids = [_approved_post(client, sara, admin, f"Post {i}") for i in range(5)]
    page1 = client.get("/api/posts?limit=3", headers=sara).json()
    assert [p["post_id"] for p in page1] == ids[::-1][:3]
    page2 = client.get(f"/api/posts?limit=3&before_id={page1[-1]['post_id']}", headers=sara).json()
    assert [p["post_id"] for p in page2] == ids[::-1][3:]
