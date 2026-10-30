"""Business accounts: UK tax-year bounds, the £1,000 trading allowance, and the tax-year
summary/CSV built from income + expenses. The summary tests need a real database:
set TEST_DATABASE_URL (a throwaway Postgres). They use tax year 2090/91 to stay isolated."""

import os
import unittest
from datetime import date, datetime
from decimal import Decimal


class TaxYearBoundsTest(unittest.TestCase):
    def test_tax_year_runs_6_april_to_5_april(self):
        from app.api.endpoints.admin_accounts import current_tax_year_start, tax_year_bounds

        self.assertEqual(tax_year_bounds(2026), (date(2026, 4, 6), date(2027, 4, 6)))
        self.assertEqual(current_tax_year_start(date(2026, 4, 5)), 2025)
        self.assertEqual(current_tax_year_start(date(2026, 4, 6)), 2026)
        self.assertEqual(current_tax_year_start(date(2027, 1, 15)), 2026)


@unittest.skipUnless(os.getenv("TEST_DATABASE_URL"), "needs TEST_DATABASE_URL (Postgres)")
class TaxYearSummaryTest(unittest.TestCase):
    YEAR = 2090

    @classmethod
    def setUpClass(cls):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        from app.database import Base
        import app.models  # noqa: F401
        from app.models.business_income import BusinessIncome
        from app.models.staff_expense import StaffExpense
        from app.models.staff_user import StaffUser

        cls.engine = create_engine(os.environ["TEST_DATABASE_URL"])
        Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)

        db = cls.Session()
        db.query(BusinessIncome).filter(BusinessIncome.income_date >= date(cls.YEAR, 1, 1)).delete()
        db.query(StaffExpense).filter(StaffExpense.expense_date >= date(cls.YEAR, 1, 1)).delete()
        stamp = str(datetime.utcnow().timestamp()).replace(".", "")
        staff = StaffUser(email=f"acc-{stamp}@example.com", hashed_password="x", employee_code=f"ACC{stamp[-8:]}")
        db.add(staff)
        db.flush()
        cls.staff_id = staff.id

        def income(day, amount, source="app_store", **kw):
            db.add(BusinessIncome(created_by_staff_user_id=staff.id, income_date=day, source=source,
                                  amount=Decimal(amount), currency="GBP", amount_gbp=Decimal(amount), **kw))

        def expense(day, amount, category="hosting", **kw):
            db.add(StaffExpense(created_by_staff_user_id=staff.id, expense_date=day, category=category,
                                amount=Decimal(amount), currency="GBP", amount_gbp=Decimal(amount), **kw))

        income(date(cls.YEAR, 4, 5), "999")  # previous tax year: excluded
        income(date(cls.YEAR, 4, 6), "600")
        income(date(cls.YEAR + 1, 4, 5), "500", source="google_play", document_filename="x.pdf")
        expense(date(cls.YEAR, 5, 1), "120", receipt_filename="r.pdf")
        expense(date(cls.YEAR, 6, 1), "30", category="domain")
        expense(date(cls.YEAR + 1, 4, 6), "77")  # next tax year: excluded
        db.commit()
        db.close()

    def _summary(self):
        from app.api.endpoints.admin_accounts import build_tax_year_summary

        db = self.Session()
        try:
            return build_tax_year_summary(db, self.YEAR)
        finally:
            db.close()

    def test_totals_only_include_the_tax_year(self):
        s = self._summary()
        self.assertEqual(s["label"], "2090/91")
        self.assertEqual(s["income_total_gbp"], 1100.0)
        self.assertEqual(s["expense_total_gbp"], 150.0)
        self.assertEqual(s["profit_gbp"], 950.0)
        self.assertEqual(s["counts"]["expenses_missing_receipt"], 1)
        self.assertEqual(s["counts"]["income_missing_document"], 1)
        self.assertEqual(s["deadlines"], {"register_by": "2091-10-05", "file_and_pay_by": "2092-01-31"})

    def test_over_allowance_uses_the_bigger_deduction(self):
        s = self._summary()
        # £1,100 income: over the £1,000 allowance; £150 expenses < £1,000, so the allowance wins.
        self.assertEqual(s["allowance_status"], "over")
        self.assertEqual(s["deduction_method"], "trading_allowance")
        self.assertEqual(s["taxable_profit_gbp"], 100.0)

    def test_csv_lists_every_row_and_the_totals(self):
        from app.api.endpoints.admin_accounts import tax_year_csv

        db = self.Session()
        try:
            response = tax_year_csv(start_year=self.YEAR, db=db, current_staff=None)
        finally:
            db.close()
        import asyncio

        async def collect():
            return b"".join([chunk async for chunk in response.body_iterator])

        text = asyncio.run(collect()).decode("utf-8-sig")
        self.assertEqual(text.count("\nIncome,"), 2)
        self.assertEqual(text.count("\nExpense,"), 2)
        self.assertIn("Total allowable expenses (GBP),150.00", text)


if __name__ == "__main__":
    unittest.main()
