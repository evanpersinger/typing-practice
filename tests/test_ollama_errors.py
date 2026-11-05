"""What the local provider says when Ollama can't write the sentences.

The two failures need different fixes, so they need different messages: a
server that isn't running, and a server that is running but refuses the request
(most often because the model isn't pulled).
"""

import pytest
import requests

from backend import agent


class FakeResponse:
    def __init__(self, status_code: int, body, text: str = "") -> None:
        self.status_code = status_code
        self.ok = status_code < 400
        self._body = body
        self.text = text

    def json(self):
        if self._body is None:
            raise ValueError("not json")
        return self._body


@pytest.fixture
def local_provider(monkeypatch):
    monkeypatch.setattr(agent, "PROVIDER", "local")


def test_server_down_says_to_start_ollama(monkeypatch, local_provider) -> None:
    def refuse(*args, **kwargs):
        raise requests.exceptions.ConnectionError("connection refused")

    monkeypatch.setattr(agent.requests, "post", refuse)
    with pytest.raises(RuntimeError, match="not reachable.*ollama serve"):
        agent.generate_drills(["necessary"])


def test_missing_model_says_to_pull_it_not_to_start_ollama(
    monkeypatch, local_provider
) -> None:
    monkeypatch.setattr(agent, "OLLAMA_MODEL", "qwen3.5:4b")
    monkeypatch.setattr(
        agent.requests,
        "post",
        lambda *a, **k: FakeResponse(404, {"error": "model 'qwen3.5:4b' not found"}),
    )
    with pytest.raises(RuntimeError) as caught:
        agent.generate_drills(["necessary"])

    message = str(caught.value)
    assert "model 'qwen3.5:4b' not found" in message
    assert "ollama pull qwen3.5:4b" in message
    assert "not reachable" not in message


def test_other_ollama_error_passes_its_text_through(monkeypatch, local_provider) -> None:
    monkeypatch.setattr(
        agent.requests,
        "post",
        lambda *a, **k: FakeResponse(500, None, text="out of memory\n"),
    )
    with pytest.raises(RuntimeError, match=r"^Ollama returned 500: out of memory\.$"):
        agent.generate_drills(["necessary"])
