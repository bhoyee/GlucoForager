"""win-back copy: drop trial wording, describe the free plan accurately

Updates the day0 and day14 win-back templates, but only rows still carrying the
original seeded wording - copy an admin has already edited is left alone.

Revision ID: 20261018_0001
Revises: 20261016_0001
Create Date: 2026-10-18
"""

from alembic import op
import sqlalchemy as sa


revision = "20261018_0001"
down_revision = "20261016_0001"
branch_labels = None
depends_on = None

P = '<p style="line-height:1.6;">'

UPDATES = [
    {
        "stage": "day0",
        "old_marker": "never stopped",
        "subject": "Ready to have it all back?",
        "heading": "Here's the progress you'd be picking back up",
        "body_html": (
            "<p>Hi {{name}},</p>"
            f"{P}{{{{usage_summary}}}} - that's real progress, and we'd love to help you keep it going.</p>"
            f"{P}Premium brings back unlimited GlucoGuide AI, recipe ideas and photo &amp; ingredient scans, "
            "plus your Daily Meal Planner - right where you left off.</p>"
            f"{P}Your free plan still includes a few of those each week, along with barcode scans, your meal "
            "diary and glucose insights - all still yours.</p>"
            f"{P}One tap brings the rest back. We'd love to see you again.</p>"
        ),
    },
    {
        "stage": "day14",
        "old_marker": "short trial",
        "subject": "Have you asked GlucoGuide lately?",
        "heading": "Real answers when you're unsure what to eat",
        "body_html": (
            "<p>Hi {{name}},</p>"
            f"{P}GlucoGuide AI answers real food questions on the spot, personalised to your profile - the "
            "moment you're unsure what to eat.</p>"
            f"{P}Your free plan includes a few GlucoGuide questions each week. Premium makes them unlimited and "
            "brings back your Daily Meal Planner and unlimited recipe ideas.</p>"
        ),
    },
]


def upgrade() -> None:
    conn = op.get_bind()
    for row in UPDATES:
        conn.execute(
            sa.text(
                "UPDATE dunning_email_templates SET subject = :subject, heading = :heading, "
                "body_html = :body_html, updated_at = now() "
                "WHERE stage = :stage AND body_html LIKE :marker"
            ),
            {
                "subject": row["subject"],
                "heading": row["heading"],
                "body_html": row["body_html"],
                "stage": row["stage"],
                "marker": f"%{row['old_marker']}%",
            },
        )


def downgrade() -> None:
    # Copy-only change; the previous wording described a trial that no longer exists.
    pass
