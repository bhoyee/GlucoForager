"""Allowlist HTML sanitizer shared by any endpoint that stores staff-authored HTML
which later renders via dangerouslySetInnerHTML somewhere in the frontend (admin
inbox messages, blog post content, etc). Strips anything not on the allowlist -
script/style/iframe/event-handler-attributes/javascript: URLs included - rather
than trying to blocklist dangerous patterns, since blocklists are easy to bypass.

Originally the inbox-only _Sanitizer in admin_inbox.py; pulled out here so other
call sites (blog) can reuse the same parser with a wider allowlist instead of
storing raw, unsanitized HTML that later renders unescaped on a public page.
"""

from __future__ import annotations

from html.parser import HTMLParser
from urllib.parse import urlparse

# Default (narrow) allowlist - matches the original inbox behavior exactly.
DEFAULT_ALLOWED_TAGS = {"b", "strong", "i", "em", "u", "br", "p", "div", "span", "ul", "ol", "li", "a"}
DEFAULT_ALLOWED_ATTRS: dict[str, set[str]] = {"a": {"href", "target", "rel"}}

# Wider allowlist for long-form content (blog posts) - adds headings, images,
# quotes/code, and simple tables, still with no script/style/event-handler surface.
RICH_CONTENT_ALLOWED_TAGS = DEFAULT_ALLOWED_TAGS | {
    "h1", "h2", "h3", "h4", "blockquote", "code", "pre", "hr",
    "img", "figure", "figcaption", "table", "thead", "tbody", "tr", "th", "td",
}
RICH_CONTENT_ALLOWED_ATTRS: dict[str, set[str]] = {
    "a": {"href", "target", "rel"},
    "img": {"src", "alt", "width", "height"},
}


#  script/style are CDATA elements per the HTML spec - the parser hands their raw body
#  to handle_data as a single chunk rather than parsing it as tags. Their markup is
#  already dropped (not in any allowlist), but without this the raw JS/CSS text would
#  still slip through as inert-but-ugly visible page text - drop it outright instead.
_RAW_TEXT_TAGS = {"script", "style"}


class _Sanitizer(HTMLParser):
    def __init__(self, allowed_tags: set[str], allowed_attrs: dict[str, set[str]]) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.allowed_tags = allowed_tags
        self.allowed_attrs = allowed_attrs
        self._skip_data_for: str | None = None

    def _safe_url(self, val: str, *, allow_mailto: bool = False) -> str | None:
        if allow_mailto and val.startswith("mailto:"):
            return val
        try:
            u = urlparse(val)
        except Exception:
            return None
        if u.scheme not in {"http", "https", ""}:
            return None
        return val

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        t = (tag or "").lower().strip()
        if t in _RAW_TEXT_TAGS:
            self._skip_data_for = t
            return
        if t not in self.allowed_tags:
            return
        safe_attrs: list[str] = []
        allowed = self.allowed_attrs.get(t, set())
        for k, v in attrs:
            key = (k or "").lower().strip()
            if key not in allowed:
                continue
            val = str(v or "").strip()
            if key == "href":
                safe = self._safe_url(val, allow_mailto=True)
                if safe is None:
                    continue
                val = safe
            elif key == "src":
                safe = self._safe_url(val)
                if safe is None:
                    continue
                val = safe
            elif key in {"target", "rel"}:
                # enforced below for <a>, never taken from user input
                continue
            elif key in {"width", "height"}:
                if not val.replace("%", "").isdigit():
                    continue
            safe_val = val.replace('"', "&quot;")
            safe_attrs.append(f'{key}="{safe_val}"')

        if t == "a":
            safe_attrs.append('target="_blank"')
            safe_attrs.append('rel="noreferrer"')

        attr_str = (" " + " ".join(safe_attrs)) if safe_attrs else ""
        self_closing = t in {"br", "hr", "img"}
        self.out.append(f"<{t}{attr_str}{'/>' if self_closing else '>'}")

    def handle_endtag(self, tag: str) -> None:
        t = (tag or "").lower().strip()
        if t in _RAW_TEXT_TAGS:
            if self._skip_data_for == t:
                self._skip_data_for = None
            return
        if t not in self.allowed_tags or t in {"br", "hr", "img"}:
            return
        self.out.append(f"</{t}>")

    def handle_data(self, data: str) -> None:
        if self._skip_data_for is not None:
            return
        text = str(data or "")
        text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        self.out.append(text)

    def handle_entityref(self, name: str) -> None:
        self.out.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        self.out.append(f"&#{name};")


def sanitize_html(
    html_content: str,
    *,
    allowed_tags: set[str] | None = None,
    allowed_attrs: dict[str, set[str]] | None = None,
    max_length: int = 100_000,
) -> str:
    raw = str(html_content or "").strip()
    if not raw:
        return ""
    parser = _Sanitizer(
        allowed_tags if allowed_tags is not None else DEFAULT_ALLOWED_TAGS,
        allowed_attrs if allowed_attrs is not None else DEFAULT_ALLOWED_ATTRS,
    )
    try:
        parser.feed(raw)
    except Exception:
        return (
            raw.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\n", "<br/>")
        )[:max_length]
    return "".join(parser.out)[:max_length]
