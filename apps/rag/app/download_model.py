import os
from huggingface_hub import snapshot_download

if __name__ == "__main__":
    snapshot_download(
        repo_id=os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5"),
        allow_patterns=["*.json", "*.safetensors", "vocab.txt", "1_Pooling/*"],
        ignore_patterns=["onnx/*", "openvino/*"],
    )
    print("Embedding model downloaded into the Docker model cache")
