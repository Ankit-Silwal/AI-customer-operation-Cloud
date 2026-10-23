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
