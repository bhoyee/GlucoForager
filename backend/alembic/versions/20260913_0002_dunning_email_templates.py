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
        "heading": "We miss you - here's what's waiting",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p style=\"line-height:1.6;\">We miss having you on Premium! Here's what comes right back the "
            "moment you resubscribe:</p>"
            "<ul style=\"line-height:1.6; padding-left:20px; margin:12px 0;\">"
            "<li>GlucoGuide AI</li>"
            "<li>Your Daily Meal Planner</li>"
            "<li>Recipe generation (scan, type, or Surprise Me)</li>"
            "<li>Unlimited photo &amp; ingredient scanning</li>"
            "</ul>"
            "<p style=\"line-height:1.6;\">Your barcode scans, food swaps, and glucose/carb tracking never "
            "stopped - they're still free and still yours.</p>"
            "<p style=\"line-height:1.6;\">One tap brings the rest back. We'd love to see you again.</p>"
        ),
    },
    {
        "stage": "day7",
        "subject": "Still with us?",
        "heading": "Still with us?",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p style=\"line-height:1.6;\">Just checking in - was there something specific that made Premium not "
            "worth it for you (price, a bug, a missing feature)? Reply to this email and let us know.</p>"
            "<p style=\"line-height:1.6;\">Or if you're ready to come back, you can resubscribe below.</p>"
        ),
    },
    {
        "stage": "day14",
        "subject": "What you're missing on the free plan",
        "heading": "What you're missing on the free plan",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p style=\"line-height:1.6;\">A quick reminder of what Premium unlocks: unlimited recipe search and "
            "scans, full diabetes-friendly meal planning, and your saved recipes and plans, all in one place.</p>"
            "<p style=\"line-height:1.6;\">Your data is still there waiting for you.</p>"
        ),
    },
    {
        "stage": "day21",
        "subject": "Last check-in for a while",
        "heading": "Last check-in for a while",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p style=\"line-height:1.6;\">This is the last weekly note from us - after this we'll only reach out "
            "occasionally.</p>"
            "<p style=\"line-height:1.6;\">If you want back in, we're one tap away.</p>"
        ),
    },
    {
        "stage": "monthly",
        "subject": "Still here when you're ready",
        "heading": "Still here when you're ready",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p style=\"line-height:1.6;\">Just a low-key reminder that GlucoForager Premium is still here "
            "whenever you want it back.</p>"
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
