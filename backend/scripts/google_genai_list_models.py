import os


def main() -> None:
    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not api_key:
        raise SystemExit("Missing GEMINI_API_KEY in environment.")

    try:
        from google import genai  # type: ignore[import-not-found]
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"google-genai is not installed: {exc}")

    client = genai.Client(api_key=api_key)

    try:
        models = list(client.models.list())
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"Failed to list models. Check API key/project access. {exc}")

    print(f"models={len(models)}")
    for m in models:
        name = getattr(m, "name", None) or ""
        methods = getattr(m, "supported_generation_methods", None) or getattr(m, "supportedGenerationMethods", None)
        methods_str = ",".join(methods) if isinstance(methods, (list, tuple)) else ""
        print(f"- {name}  [{methods_str}]")


if __name__ == "__main__":
    main()

