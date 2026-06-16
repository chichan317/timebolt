# TimeBolt sync server — setup

This folder holds a tiny server that lets TimeBolt keep the same data on your
computer and phone. It's **one PHP file** plus an `.htaccess`. No database.

You upload it to your own hosting (e.g. SiteGround), choose a password, and
enter that address + password in TimeBolt on each device.

---

## What you need
- A web hosting account that runs PHP (SiteGround does, on every plan).
- 5 minutes.

## Step 1 — Choose a secret password (token)
Pick a long, random secret — at least 25 characters, letters and numbers. This
is what keeps your data private. Example of the *kind* of thing (make your own):

```
k9Qz7mР  ... (don't use this one — invent your own long string)
```

Tip: on a Mac you can generate one in Terminal with:

```
LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32; echo
```

Copy what it prints. Keep it somewhere safe — you'll paste it into TimeBolt.

## Step 2 — Put your token into the file
Open `timebolt-sync.php` in a text editor and find this line near the top:

```php
const TIMEBOLT_TOKEN = 'CHANGE-ME-to-a-long-random-secret';
```

Replace `CHANGE-ME-to-a-long-random-secret` with your token (keep the quotes):

```php
const TIMEBOLT_TOKEN = 'your-long-secret-here';
```

Save the file.

## Step 3 — Upload to SiteGround
1. Log in to SiteGround → **Site Tools** → **Site** → **File Manager**.
2. Open the **`public_html`** folder (that's your website's main folder).
3. Upload the **one** file: `timebolt-sync.php`.
   *(The `.htaccess` in this folder is optional extra protection — the data
   file already protects itself. You can skip it.)*

Your sync address is now:

```
https://YOUR-DOMAIN/timebolt-sync.php
```

(Replace `YOUR-DOMAIN` with your actual domain. If you put the files in a
subfolder, include it, e.g. `https://YOUR-DOMAIN/timebolt/timebolt-sync.php`.)

## Step 4 — Turn on sync in TimeBolt
On **each** device (computer and phone):
1. Open TimeBolt → **Settings** → **Sync across devices**.
2. **Server address:** the URL from Step 3.
3. **Password:** the token from Step 1.
4. Press **Connect**.

That's it. Use the **same address and password on both devices** and they'll
share the same data — pulling when you open the app and pushing after each
change.

---

## Good to know
- **Privacy:** your data goes only to *your* server, protected by your token,
  over HTTPS. The data file can't be opened directly in a browser (it's a `.php`
  file that exits immediately); only the password-protected script reads it.
- **Safety net:** the manual **Download JSON backup** in Settings still works —
  keep using it occasionally just in case.
- **Conflicts:** if you edit on both devices while offline at the same time, the
  most recent change wins and the other is replaced. For one person switching
  between devices this is rarely an issue.
- **Changing the password later:** edit `TIMEBOLT_TOKEN` in the file, re-upload,
  and update it in Settings on each device.
