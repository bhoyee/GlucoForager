from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

import httpx


EXCHANGE_RATE_API_BASE_URL = "https://open.er-api.com/v6/latest"
EXCHANGE_RATE_SOURCE = "open.er-api.com"


@dataclass(frozen=True)
class GbpConversion:
    amount_gbp: Decimal
    rate_to_gbp: Decimal
    source: str
    converted_at: datetime


class ExchangeRateError(RuntimeError):
    pass


def convert_to_gbp(amount: Decimal, currency: str) -> GbpConversion:
    source_currency = str(currency or "GBP").strip().upper()
    if source_currency == "GBP":
        return GbpConversion(
            amount_gbp=_money(amount),
            rate_to_gbp=Decimal("1"),
            source="fixed:GBP",
            converted_at=datetime.utcnow(),
        )

    try:
        with httpx.Client(timeout=8.0) as client:
            response = client.get(f"{EXCHANGE_RATE_API_BASE_URL}/{source_currency}")
            response.raise_for_status()
            data = response.json()
    except Exception as exc:  # noqa: BLE001
        raise ExchangeRateError("Could not fetch the latest exchange rate") from exc

    if str(data.get("result") or "").lower() != "success":
        raise ExchangeRateError("Exchange rate provider did not return a successful response")

    rates = data.get("rates") if isinstance(data, dict) else None
    rate_value = rates.get("GBP") if isinstance(rates, dict) else None
    if rate_value is None:
        raise ExchangeRateError(f"GBP rate is not available for {source_currency}")

    try:
        rate = Decimal(str(rate_value))
    except Exception as exc:  # noqa: BLE001
        raise ExchangeRateError("Exchange rate provider returned an invalid GBP rate") from exc

    return GbpConversion(
        amount_gbp=_money(amount * rate),
        rate_to_gbp=rate,
        source=EXCHANGE_RATE_SOURCE,
        converted_at=datetime.utcnow(),
    )


def _money(value: Decimal) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
