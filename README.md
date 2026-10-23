# میزکار

میز کار روزانهٔ برنامه‌نویس، کاملاً آفلاین: https://saeedhosseiinii.github.io/mizkar/

- پیش‌نمایش راست‌چین Markdown (جدول، Mermaid، فرمول ریاضی، callout)
- JSON، YAML، CSV، TOML، INI، XML، Log، SQL، Diff، JWT و Cron با تشخیص خودکار
- مقایسهٔ JSON و متن، فیلتر JSON، تحلیل Log
- ارائه (اسلاید از Markdown)، تبدیل زمان و تاریخ شمسی، ماشین‌حساب شبکه IPv4/IPv6، جعبه‌ابزار کدگذاری
- خروجی PDF، HTML، تصویر و لینک اشتراک — متن از مرورگر شما بیرون نمی‌رود

## توسعه

| مسیر | نقش |
| --- | --- |
| `src/app.js` | کد اپ (ویرایش اینجا) |
| `src/index.shell.html` | پوستهٔ HTML |
| `app.js` / `index.html` | کپی سروشده |
| `vendor/` | Mermaid و KaTeX |

```bash
$EDITOR src/app.js
python3 tools/build.py --shell
python3 -m http.server 8765
```
