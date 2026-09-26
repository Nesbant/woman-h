"""Railway option A: FastAPI serves the built SPA (`frontend/dist`) from the same origin as `/api/*`."""
from pathlib import Path
import pytest
from app.config import settings


@pytest.fixture
def frontend_dist(tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><html><body>vera-spa</body></html>")
    (dist / "assets" / "app.js").write_text("console.log('vera')")
    monkeypatch.setattr(settings(), "frontend_dist", dist)
    return dist


def test_serves_a_built_asset_file(client, frontend_dist):
    response = client.get("/assets/app.js")
    assert response.status_code == 200
    assert response.text == "console.log('vera')"


def test_falls_back_to_index_html_for_unknown_spa_route(client, frontend_dist):
    response = client.get("/situacion/123/entender")
    assert response.status_code == 200
    assert "vera-spa" in response.text


def test_root_path_serves_index_html(client, frontend_dist):
    response = client.get("/")
    assert response.status_code == 200
    assert "vera-spa" in response.text


def test_unknown_api_route_stays_a_json_404(client, frontend_dist):
    response = client.get("/api/no-existe")
    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


def test_path_traversal_outside_the_dist_dir_is_blocked(client, frontend_dist, tmp_path):
    secret = tmp_path / "secret.txt"
    secret.write_text("no deberia ser visible")
    response = client.get("/assets/../../secret.txt")
    assert response.status_code in (200, 404)
    assert "no deberia ser visible" not in response.text


def test_without_a_dist_dir_behaves_like_before(client, monkeypatch):
    monkeypatch.setattr(settings(), "frontend_dist", Path("/no-existe-vera-dist"))
    response = client.get("/situacion/123/entender")
    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}
