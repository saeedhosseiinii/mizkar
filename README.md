# میزکار

میز کار روزانهٔ برنامه‌نویس، در یک فایل HTML و کاملاً آفلاین: https://saeedhosseiinii.github.io/mizkar/

- پیش‌نمایش راست‌چین Markdown (جدول، Mermaid، فرمول ریاضی، callout)
- JSON، YAML، CSV، TOML، INI، XML، Log، SQL، Diff، JWT و Cron با تشخیص خودکار
- مقایسهٔ JSON و متن، فیلتر JSON، تحلیل Log
- ارائه (اسلاید از Markdown)، تبدیل زمان و تاریخ شمسی، ماشین‌حساب شبکه IPv4/IPv6، جعبه‌ابزار کدگذاری
- خروجی PDF، HTML، تصویر و لینک اشتراک — متن از مرورگر شما بیرون نمی‌رود

## توسعهٔ نسخهٔ ۲ (`beta2/`)

سورس از HTML پنج‌مگابایتی جدا شده:

| مسیر | نقش |
| --- | --- |
| `src/app.js` | کد اپ (ویرایش اینجا) |
| `beta2/app.js` | کپی سروشده — با `python3 tools/build.py` به‌روز کن |
| `beta2/vendor/` | Mermaid و KaTeX |
| `beta2/index.html` | پوستهٔ سبک (~۴۵KB) |

```bash
# ویرایش
$EDITOR src/app.js
python3 tools/build.py
# سرو محلی
cd beta2 && python3 -m http.server 8765
```

