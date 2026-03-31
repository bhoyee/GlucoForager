## Payslip logo (header + watermark)

You can show a company logo in two places in the payslip PDF:

1) **Header logo** (replaces the `Bhoyee Global Enterprise` text at the top-left)
2) **Watermark logo** (faint background image across the page)

### 1) Header logo

- Put your logo file in: `backend/app/assets/bge.png`
- Set this env var:

`PAYROLL_HEADER_LOGO_PATH=app/assets/bge.png`

This path can be **relative** (like above) or **absolute**.

### 2) Watermark logo (optional)

- Put your logo file in: `backend/app/assets/bge.png`
- Set this env var:

`PAYROLL_LOGO_PATH=app/assets/bge.png`

### Notes

- Recommended format: PNG with transparent background.
- If a header logo path is not set (or fails to load), the PDF falls back to the holding name text.
