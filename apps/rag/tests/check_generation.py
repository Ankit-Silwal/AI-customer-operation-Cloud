import os
from app.config import Settings
from app.llm import generate_answer

settings = Settings(
    jwt_secret="local-simulation-secret-at-least-32-characters",
    api_key="local-simulation-placeholder",
    base_url=os.getenv("SIMULATION_BASE_URL", "http://127.0.0.1:4900/gemini/v1/"),
)
sources = [{"documentId": "local-source", "title": "Refund policy", "text": "Refunds are available within 30 days."}]
result = generate_answer(settings, "What is the refund window?", sources)
assert result["answer"] == "Refunds are available within 30 days. [1]"
assert result["sources"] == sources
assert result["model"] == "gemini-3.1-flash-lite"
print("Generation client passed 3 assertions against the local Postman simulation")

history = [{"role": "user", "content": "Can I return a product?"}, {"role": "assistant", "content": result["answer"]}]
follow_up = generate_answer(settings, "What is that deadline again?", sources, history)
assert follow_up["answer"] == "Refunds are available within 30 days. [1]"
history.extend([{"role": "user", "content": "What is that deadline again?"}, {"role": "assistant", "content": follow_up["answer"]}])
third = generate_answer(settings, "Please confirm it once more.", sources, history)
assert third["answer"] == follow_up["answer"]
print("Three-turn Gemini-compatible client conversation passed against the local Postman simulation")
