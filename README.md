# Walam React Native App

Native React Native/Expo frontend for the existing PHP backend.

## Run

```powershell
cd C:\myapp\walamapp\mobile
npm.cmd install
npm.cmd run start
```

For Android:

```powershell
npm.cmd run android
```

For iOS, run on macOS with Xcode:

```bash
npm install
npm run ios
```

## API

Default API URL:

```text
https://walam.app/mobile-api.php
```

If testing locally, change it on the login screen to something like:

```text
http://YOUR-LAN-IP/walamapp/mobile-api.php
```

## Mobile token

After logging into the website, open:

```text
https://walam.app/mobile-api.php?action=issue_token
```

Copy `session.token` into the app login screen.

The app also supports exchanging an existing user access token:

```http
POST /mobile-api.php
Content-Type: application/json

{
  "action": "exchange_access_token",
  "fb_user_id": "USER_ID",
  "access_token": "EXISTING_USER_ACCESS_TOKEN"
}
```
