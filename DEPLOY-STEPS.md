# Deploy Rent A Room, step by step (Windows cmd)

Everything below is typed into a normal Command Prompt, except step 2 which is a
browser and cannot be anything else.

Open Command Prompt and go to the project once, at the start:

```cmd
cd /d "C:\Users\David\Downloads\Rent a Room Frame-2--main\Frame-2--main"
```

---

## Step 1. Check the app runs locally

```cmd
node server.js
```

Then open http://localhost:3000 in a browser. Press Ctrl+C in the window to stop it.
Expect the site to list Soweto rooms and `/admin` to show a login screen.

---

## Step 2. Create the Render account (browser, one time)

No command line can do this. Render will not issue an API key to an account that
does not exist.

1. Go to **render.com**, click **Get Started**, choose **GitHub**.
2. GitHub asks which repositories Render may access. Choose
   **Only select repositories** and tick **rent-a-room**.
   The repo is private, so without this the build cannot fetch the code.
3. In Render, click your avatar, then **Account Settings**, then **API Keys**,
   then **Create API Key**. Copy it. It starts with `rnd_`.

No card is needed at any point.

---

## Step 3. Deploy

```cmd
powershell -ExecutionPolicy Bypass -File deploy\deploy-render.ps1 -ApiKey rnd_YOURKEYHERE
```

This creates the service from the Dockerfile, sets all ten environment variables
including the four secrets, starts the build, waits for it, and prints the live
URL. Expect four to eight minutes for the first build.

Success looks like:

```
status  : healthy
database: connected
LIVE and talking to Atlas: https://rent-a-room.onrender.com
```

If it fails, the exact Render API error is printed. Send that whole message on.

---

## Step 4. See your admin password

```cmd
type deploy\ADMIN-PASSWORD.txt
```

That is the password for `https://<your-url>/admin` on the live site.

---

## Step 5. Point the Android app at the live backend

Use the URL step 3 printed.

```cmd
powershell -ExecutionPolicy Bypass -File deploy\set-live-url.ps1 -Url https://rent-a-room.onrender.com
```

It checks the URL is healthy first, writes it into `android-app\www\config.js`,
commits and pushes. The push automatically starts the APK build.

**Before running this, read the warning below about domains.**

---

## Step 6. Watch the APK build and download it

```cmd
gh run watch
```

When it finishes:

```cmd
gh run download --name rent-a-room-debug-apk
```

That puts `app-debug.apk` in the current folder. Copy it to an Android phone and
install it, allowing installation from unknown sources.

---

## Warning about step 5, read before you do it

An installed APK cannot be updated remotely. Whatever URL goes into step 5 is
what every copy you hand out talks to, permanently. If you change hosting later,
every installed app breaks and you have to chase each person to reinstall.

So if you plan to give this app to actual landlords rather than just test it
yourself, register your domain first, point `api.yourdomain.co.za` at the
service, and use that in step 5 instead. Then the host becomes swappable with a
DNS change and installed apps never notice.

For testing on your own phone, the `onrender.com` URL is fine.

---

## Two things about the free plan

The service sleeps after 15 minutes with no traffic. The next visitor waits
roughly 30 to 50 seconds while it wakes. Fine for testing, poor for real users
who will assume the site is broken.

Removing that means either a paid Render plan or Google Cloud Run, which needs
the Google billing account reopened. `deploy\deploy-cloudrun.ps1` is ready for
that whenever it is sorted.
