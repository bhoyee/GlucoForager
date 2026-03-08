# Recipe image generation (Google GenAI)

This backend can generate 512×512 recipe images on-demand using Google's GenAI API.

## 1) Get an API key (Google AI Studio)

1. Open Google AI Studio.
2. Create/select a project.
3. Create an API key (Gemini API key).
4. Make sure the key has **no** restrictive HTTP referrer / IP restrictions while testing.

## 2) Verify which image model your key can access

From the `backend` folder:

```powershell
$env:GEMINI_API_KEY="YOUR_KEY_HERE"
python .\scripts\google_genai_list_models.py
```

Pick a model that can generate images:

- **Imagen** models typically start with `imagen-...` (uses `generate_images`).
- Some **Gemini** models can return images via `generate_content` (varies by project access).

## 3) Configure the backend

Set in `backend/.env`:

```env
GEMINI_API_KEY=YOUR_KEY_HERE
GEMINI_IMAGE_MODEL=imagen-4.0-generate-001
```

Then restart the backend.

## 4) Admin toggle + limits

- Admin can enable/disable recipe images and set limits in the admin settings page.
- Mobile hides image placeholders in lists and only shows thumbnails once a real image exists.

