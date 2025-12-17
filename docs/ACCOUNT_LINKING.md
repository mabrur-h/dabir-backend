# Account Linking Integration Guide

This document describes how to implement account linking between Google and Telegram authentication providers in the Dabir Notes platform.

## Overview

Account linking allows users to:
- Link their Telegram account to an existing Google account
- Link their Google account to an existing Telegram account
- Access the same data from both platforms
- Merge accounts if they accidentally created separate accounts

## API Endpoints

### Get Linked Accounts Status

```
GET /api/v1/auth/link/status
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "google": {
      "linked": true,
      "email": "user@gmail.com"
    },
    "telegram": {
      "linked": false,
      "username": null
    }
  }
}
```

---

### Link Telegram to Google Account

#### Step 1: Initialize (Frontend)

```
POST /api/v1/auth/link/telegram/init
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "abc123...",
    "deepLink": "https://t.me/dabirbot?start=link_abc123...",
    "expiresIn": 300
  }
}
```

#### Step 2: Complete (Bot - automatic)

When user clicks the deep link, the bot automatically calls:

```
POST /api/v1/auth/link/telegram/complete
Content-Type: application/json

{
  "token": "abc123...",
  "telegramId": 123456789,
  "username": "johndoe",
  "firstName": "John",
  "lastName": "Doe",
  "languageCode": "en",
  "isPremium": false,
  "photoUrl": "https://..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": { ... },
    "merged": false,
    "message": "Telegram account linked successfully."
  }
}
```

---

### Link Google to Telegram Account

#### Step 1: Initialize (Frontend)

```
POST /api/v1/auth/link/google/init
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "xyz789...",
    "expiresIn": 300
  }
}
```

#### Step 2: Complete (Frontend - after Google OAuth)

```
POST /api/v1/auth/link/google/complete
Content-Type: application/json

{
  "token": "xyz789...",
  "idToken": "<google_id_token>"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": { ... },
    "merged": true,
    "message": "Accounts merged successfully. All your data has been combined."
  }
}
```

---

### Unlink Accounts

#### Unlink Google

```
POST /api/v1/auth/unlink/google
Authorization: Bearer <accessToken>
```

**Note:** Requires Telegram to be linked (can't remove only auth method).

#### Unlink Telegram

```
POST /api/v1/auth/unlink/telegram
Authorization: Bearer <accessToken>
```

**Note:** Requires Google to be linked (can't remove only auth method).

---

## Frontend Implementation

### React/TypeScript Example

```typescript
// hooks/useAccountLinking.ts
import { useState } from 'react';
import { useAuth } from './useAuth';

interface LinkedStatus {
  google: { linked: boolean; email?: string };
  telegram: { linked: boolean; username?: string };
}

export function useAccountLinking() {
  const { accessToken, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getLinkedStatus = async (): Promise<LinkedStatus> => {
    const response = await fetch('/api/v1/auth/link/status', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json();
    return data.data;
  };

  const initTelegramLink = async (): Promise<{ deepLink: string }> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/auth/link/telegram/init', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to initialize link');
      }

      return { deepLink: data.data.deepLink };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const initGoogleLink = async (): Promise<{ token: string }> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/auth/link/google/init', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to initialize link');
      }

      return { token: data.data.token };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const completeGoogleLink = async (
    linkToken: string,
    googleIdToken: string
  ): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/auth/link/google/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: linkToken, idToken: googleIdToken }),
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to link Google');
      }

      // Refresh user data
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const unlinkGoogle = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/auth/unlink/google', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to unlink');
      }

      await refreshUser();
    } finally {
      setLoading(false);
    }
  };

  const unlinkTelegram = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/auth/unlink/telegram', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to unlink');
      }

      await refreshUser();
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    getLinkedStatus,
    initTelegramLink,
    initGoogleLink,
    completeGoogleLink,
    unlinkGoogle,
    unlinkTelegram,
  };
}
```

### Settings Page Component Example

```tsx
// components/LinkedAccountsSettings.tsx
import { useState, useEffect } from 'react';
import { useAccountLinking } from '../hooks/useAccountLinking';
import { useGoogleLogin } from '@react-oauth/google';

export function LinkedAccountsSettings() {
  const {
    loading,
    error,
    getLinkedStatus,
    initTelegramLink,
    initGoogleLink,
    completeGoogleLink,
    unlinkGoogle,
    unlinkTelegram,
  } = useAccountLinking();

  const [status, setStatus] = useState<{
    google: { linked: boolean; email?: string };
    telegram: { linked: boolean; username?: string };
  } | null>(null);

  const [pendingGoogleLinkToken, setPendingGoogleLinkToken] = useState<string | null>(null);

  useEffect(() => {
    getLinkedStatus().then(setStatus);
  }, []);

  // Google OAuth for linking
  const googleLogin = useGoogleLogin({
    onSuccess: async (response) => {
      if (pendingGoogleLinkToken) {
        // Get ID token from access token
        const userInfo = await fetch(
          `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${response.access_token}`
        );
        // Note: You'll need to exchange this for an ID token or use implicit flow
        // This is simplified - actual implementation depends on your OAuth setup
        await completeGoogleLink(pendingGoogleLinkToken, response.access_token);
        setPendingGoogleLinkToken(null);
        const newStatus = await getLinkedStatus();
        setStatus(newStatus);
      }
    },
  });

  const handleLinkTelegram = async () => {
    const { deepLink } = await initTelegramLink();
    // Open Telegram deep link
    window.open(deepLink, '_blank');

    // Poll for completion (optional - user might need to refresh)
    const pollInterval = setInterval(async () => {
      const newStatus = await getLinkedStatus();
      if (newStatus.telegram.linked) {
        clearInterval(pollInterval);
        setStatus(newStatus);
      }
    }, 3000);

    // Stop polling after 5 minutes
    setTimeout(() => clearInterval(pollInterval), 300000);
  };

  const handleLinkGoogle = async () => {
    const { token } = await initGoogleLink();
    setPendingGoogleLinkToken(token);
    googleLogin();
  };

  const handleUnlinkGoogle = async () => {
    if (confirm('Are you sure you want to unlink your Google account?')) {
      await unlinkGoogle();
      const newStatus = await getLinkedStatus();
      setStatus(newStatus);
    }
  };

  const handleUnlinkTelegram = async () => {
    if (confirm('Are you sure you want to unlink your Telegram account?')) {
      await unlinkTelegram();
      const newStatus = await getLinkedStatus();
      setStatus(newStatus);
    }
  };

  if (!status) return <div>Loading...</div>;

  return (
    <div className="linked-accounts-settings">
      <h2>Linked Accounts</h2>

      {error && <div className="error">{error}</div>}

      {/* Google Account */}
      <div className="account-row">
        <div className="account-info">
          <span className="icon">🔵</span>
          <span className="provider">Google</span>
          {status.google.linked ? (
            <span className="status connected">
              ✓ {status.google.email}
            </span>
          ) : (
            <span className="status disconnected">Not linked</span>
          )}
        </div>
        <div className="account-actions">
          {status.google.linked ? (
            <button
              onClick={handleUnlinkGoogle}
              disabled={loading || !status.telegram.linked}
              title={!status.telegram.linked ? 'Link Telegram first' : ''}
            >
              Unlink
            </button>
          ) : (
            <button onClick={handleLinkGoogle} disabled={loading}>
              Link Google
            </button>
          )}
        </div>
      </div>

      {/* Telegram Account */}
      <div className="account-row">
        <div className="account-info">
          <span className="icon">📱</span>
          <span className="provider">Telegram</span>
          {status.telegram.linked ? (
            <span className="status connected">
              ✓ @{status.telegram.username || 'Connected'}
            </span>
          ) : (
            <span className="status disconnected">Not linked</span>
          )}
        </div>
        <div className="account-actions">
          {status.telegram.linked ? (
            <button
              onClick={handleUnlinkTelegram}
              disabled={loading || !status.google.linked}
              title={!status.google.linked ? 'Link Google first' : ''}
            >
              Unlink
            </button>
          ) : (
            <button onClick={handleLinkTelegram} disabled={loading}>
              Link Telegram
            </button>
          )}
        </div>
      </div>

      <p className="note">
        Linking accounts allows you to access your data from both Google and Telegram.
        You must have at least one authentication method linked at all times.
      </p>
    </div>
  );
}
```

---

## Telegram Bot Implementation

The bot automatically handles account linking when users click the deep link. The implementation is in `src/bot/handlers/accountLinking.ts`.

### Deep Link Format

```
https://t.me/{bot_username}?start=link_{token}
```

### Bot Handler Flow

1. User clicks deep link from web app
2. Bot receives `/start link_{token}` command
3. Bot calls `POST /api/v1/auth/link/telegram/complete` with user's Telegram data
4. Bot displays success/error message to user

### Messages (Uzbek)

**Success (new link):**
```
✅ Telegram hisobi muvaffaqiyatli ulandi!

Endi siz Google yoki Telegram orqali tizimga kirishingiz mumkin.

Barcha ma'lumotlaringiz har ikki hisobda ham mavjud bo'ladi.
```

**Success (merged accounts):**
```
🎉 Hisoblar muvaffaqiyatli birlashtirildi!

Telegram va Google hisoblaringiz birlashtirildi.
Barcha ma'lumotlaringiz endi bir hisobda.

Endi siz ikkala usul bilan ham tizimga kirishingiz mumkin.
```

**Error (expired token):**
```
Havola muddati tugagan yoki noto'g'ri.

Iltimos, web ilovadan yangi havola oling.
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_LINK_TOKEN` | Token is invalid or expired (5 min TTL) |
| `TELEGRAM_ALREADY_LINKED` | Telegram account is already linked |
| `GOOGLE_ALREADY_LINKED` | Google account is already linked |
| `GOOGLE_AUTH_REQUIRED` | User must be authenticated with Google first |
| `TELEGRAM_AUTH_REQUIRED` | User must be authenticated with Telegram first |
| `CANNOT_UNLINK_ONLY_AUTH` | Can't unlink the only authentication method |
| `INVALID_LINK_TYPE` | Wrong token type for the operation |
| `USER_NOT_FOUND` | User not found in database |

---

## Account Merging

When linking accounts, if the target account (Google or Telegram) already exists on a different user, the system will **automatically merge** the accounts:

1. All lectures are moved to the target account
2. All folders are moved to the target account
3. All tags are moved to the target account
4. Subscription minutes are combined
5. Payment history is preserved
6. The source account is deleted
7. All refresh tokens for the source account are revoked

The user is notified via the `merged: true` flag in the response.

---

## Environment Variables

### Backend (uznotes-ai)

```env
TELEGRAM_BOT_USERNAME=dabirbot  # For generating deep links
```

### Bot (uznotes-bot)

```env
WEB_APP_URL=https://dabir.uz  # For success message button
API_BASE_URL=https://api.dabir.uz  # API endpoint
```

---

## Security Considerations

1. **Token TTL**: Link tokens expire after 5 minutes
2. **One-time use**: Tokens are deleted after successful use
3. **Rate limiting**: Complete endpoints are rate-limited
4. **No auth required for complete**: The token itself serves as authorization
5. **Merge protection**: Users are notified when accounts are merged

---

## Testing

### Test Link Flow (Development)

1. Sign in with Google on web app
2. Go to Settings → Linked Accounts
3. Click "Link Telegram"
4. Click the generated deep link
5. Verify success message in Telegram
6. Refresh web app - Telegram should show as linked

### Test Merge Flow

1. Create account A with Google
2. Create account B with Telegram (upload some lectures)
3. On account A, initiate Telegram link
4. Complete link with Telegram user B
5. Verify all data from B is now in A
6. Verify account B no longer exists
