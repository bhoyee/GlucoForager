"""add dunning_email_templates, seeded with the current hardcoded win-back copy

Revision ID: 20260913_0002
Revises: 20260913_0001
Create Date: 2026-09-13
"""

from alembic import op
import sqlalchemy as sa


revision = "20260913_0002"
down_revision = "20260913_0001"
branch_labels = None
depends_on = None

# Same copy that previously lived as hardcoded Python in email_service.py's
# send_dunning_day0_email/day7/day14/day21/monthly - seeded here so the admin
# template page starts showing exactly what's actually been going out.
SEED_TEMPLATES = [
    {
        "stage": "day0",
        "subject": "Ready to have it all back?",
        "heading": "Here's the progress you'd be picking back up",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p style=\"line-height:1.6;\">{{usage_summary}} - that's real progress, and we'd love to help "
            "you keep it going.</p>"
            "<p style=\"line-height:1.6;\">Resubscribing brings back GlucoGuide AI, your Daily Meal Planner, "
            "recipe generation, and unlimited photo &amp; ingredient scanning - right where you left off.</p>"
            "<p style=\"line-height:1.6;\">Your barcode scans, food swaps, and glucose/carb tracking never "
            "stopped - they're still free and still yours.</p>"
            "<p style=\"line-height:1.6;\">One tap brings the rest back. We'd love to see you again.</p>"
        ),
    },
    {
        "stage": "day7",
        "subject": "Quick question before you go",
        "heading": "What made Premium not worth it right now?",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p style=\"line-height:1.6;\">You've been on the free plan a week now, and we're genuinely "
            "curious - was it the price, a bug, a missing feature, or just bad timing? Hit reply and tell us; "
            "we read every message.</p>"
            "<p style=\"line-height:1.6;\">And if you just haven't gotten around to it, resubscribing takes "
            "one tap whenever you're ready.</p>"
        ),
    },
    {
        "stage": "day14",
        "subject": "Have you tried asking GlucoGuide yet?",
        "heading": "The one Premium feature people miss trying",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p style=\"line-height:1.6;\">A lot of people don't get to try GlucoGuide AI during a short "
            "trial - it's built to answer real food questions on the spot, personalized to your profile, the "
            "moment you're unsure what to eat.</p>"
            "<p style=\"line-height:1.6;\">It comes right back with your Daily Meal Planner and recipe "
            "generation when you resubscribe.</p>"
            "<p style=\"line-height:1.6;\">Your barcode scans, food swaps, and glucose/carb tracking are "
            "still free in the meantime.</p>"
        ),
    },
    {
        "stage": "day21",
        "subject": "Last note for a while",
        "heading": "No pressure, no lock-in",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p style=\"line-height:1.6;\">This is the last weekly note from us - after this we'll only reach "
            "out occasionally.</p>"
            "<p style=\"line-height:1.6;\">If price or commitment was the hesitation: you can resubscribe and "
            "cancel anytime, no long-term lock-in either way.</p>"
            "<p style=\"line-height:1.6;\">If you want back in, we're one tap away.</p>"
        ),
    },
    {
        "stage": "monthly",
        "subject": "Still here when you're ready",
        "heading": "No rush - we're not going anywhere",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p style=\"line-height:1.6;\">Just a low-key reminder that GlucoGuide AI, your Daily Meal "
            "Planner, and full scanning are still here whenever you want them back. No pressure.</p>"
        ),
    },
]

dunning_email_templates_table = sa.table(
    "dunning_email_templates",
    sa.column("stage", sa.String),
    sa.column("subject", sa.String),
    sa.column("heading", sa.String),
    sa.column("body_html", sa.Text),
)


def upgrade() -> None:
    op.create_table(
        "dunning_email_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("stage", sa.String(), nullable=False),
        sa.Column("subject", sa.String(), nullable=False),
        sa.Column("heading", sa.String(), nullable=False),
        sa.Column("body_html", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("updated_by_admin_id", sa.Integer(), sa.ForeignKey("admin_users.id"), nullable=True),
    )
    op.create_index("ix_dunning_email_templates_stage", "dunning_email_templates", ["stage"], unique=True)
    op.bulk_insert(dunning_email_templates_table, SEED_TEMPLATES)


def downgrade() -> None:
    op.drop_index("ix_dunning_email_templates_stage", table_name="dunning_email_templates")
    op.drop_table("dunning_email_templates")
