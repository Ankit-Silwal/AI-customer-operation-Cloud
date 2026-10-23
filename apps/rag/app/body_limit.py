from fastapi.responses import JSONResponse


class BodyLimit:
    """Bound actual ASGI bytes, including chunked requests without Content-Length."""
    def __init__(self, app, maximum=16384):
        self.app = app
        self.maximum = maximum

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        messages, size = [], 0
        while True:
            message = await receive()
            messages.append(message)
            size += len(message.get("body", b""))
            if size > self.maximum:
                response = JSONResponse(status_code=413, content={"error": "Request too large", "requestId": scope.get("state", {}).get("request_id", "")})
                return await response(scope, receive, send)
            if not message.get("more_body", False):
                break

        async def replay():
            return messages.pop(0) if messages else await receive()

        await self.app(scope, replay, send)
