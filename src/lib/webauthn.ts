export interface WebAuthnSupportStatus {
  supported: boolean;
  platformAvailable: boolean;
  reason?: string;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((base64Url.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function createChallenge(): { raw: Uint8Array; b64Url: string } {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  return { raw, b64Url: bufferToBase64Url(raw.buffer) };
}

function parseWebAuthnError(error: unknown): Error {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return new Error(
        'Biometric prompt was cancelled, timed out, or blocked by browser/iframe permissions.'
      );
    }
    if (error.name === 'SecurityError') {
      return new Error(
        'Web Authentication requires a secure HTTPS origin or top-level browser context.'
      );
    }
    if (error.name === 'InvalidStateError') {
      return new Error('This authenticator is already registered for your wallet.');
    }
    if (error.name === 'NotSupportedError') {
      return new Error('This device or browser does not support the requested WebAuthn algorithms.');
    }
  }
  return error instanceof Error
    ? error
    : new Error('Biometric verification could not be completed.');
}

export async function checkWebAuthnSupport(): Promise<WebAuthnSupportStatus> {
  if (
    typeof window === 'undefined' ||
    typeof window.PublicKeyCredential === 'undefined' ||
    !navigator.credentials
  ) {
    return {
      supported: false,
      platformAvailable: false,
      reason: 'Web Authentication API is not supported in this browser.',
    };
  }

  try {
    const platformAvailable =
      await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return {
      supported: true,
      platformAvailable,
    };
  } catch {
    return {
      supported: true,
      platformAvailable: false,
    };
  }
}

export async function enrollBiometricCredential(params: {
  uid: string;
  email: string | null;
  displayName: string;
}): Promise<{ credentialId: string }> {
  const support = await checkWebAuthnSupport();
  if (!support.supported) {
    throw new Error(support.reason || 'WebAuthn is not supported in this browser.');
  }

  const challenge = createChallenge();
  const userIdBytes = new TextEncoder().encode(params.uid).slice(0, 64);

  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: challenge.raw.buffer as ArrayBuffer,
        rp: {
          name: 'CDCCoin Wallet',
        },
        user: {
          id: userIdBytes.buffer as ArrayBuffer,
          name: params.email || params.uid,
          displayName: params.displayName,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: support.platformAvailable
          ? {
              authenticatorAttachment: 'platform',
              userVerification: 'required',
              residentKey: 'preferred',
            }
          : {
              userVerification: 'preferred',
              residentKey: 'preferred',
            },
        timeout: 60000,
        attestation: 'none',
      },
    });

    if (!(credential instanceof PublicKeyCredential)) {
      throw new Error('No biometric credential returned by the authenticator.');
    }

    const response = credential.response as AuthenticatorAttestationResponse;
    const clientData = JSON.parse(
      new TextDecoder().decode(response.clientDataJSON)
    ) as { type?: string; challenge?: string; origin?: string };

    if (clientData.type !== 'webauthn.create') {
      throw new Error('Unexpected WebAuthn ceremony type.');
    }
    if (clientData.challenge !== challenge.b64Url) {
      throw new Error('WebAuthn challenge verification failed.');
    }
    if (clientData.origin !== window.location.origin) {
      throw new Error('WebAuthn origin verification failed.');
    }

    const credentialId = bufferToBase64Url(credential.rawId);
    if (!credentialId || credentialId.length > 256) {
      throw new Error('Invalid credential identifier length returned by authenticator.');
    }

    return { credentialId };
  } catch (error) {
    throw parseWebAuthnError(error);
  }
}

export async function verifyBiometricCredential(credentialId: string): Promise<boolean> {
  const support = await checkWebAuthnSupport();
  if (!support.supported) {
    throw new Error(support.reason || 'WebAuthn is not supported in this browser.');
  }

  const challenge = createChallenge();
  const allowIdBytes = base64UrlToUint8Array(credentialId);

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challenge.raw.buffer as ArrayBuffer,
        allowCredentials: [
          {
            id: allowIdBytes.buffer as ArrayBuffer,
            type: 'public-key',
          },
        ],
        userVerification: support.platformAvailable ? 'required' : 'preferred',
        timeout: 60000,
      },
    });

    if (!(assertion instanceof PublicKeyCredential)) {
      throw new Error('Biometric verification did not return a valid assertion.');
    }

    const returnedId = bufferToBase64Url(assertion.rawId);
    if (returnedId !== credentialId) {
      throw new Error('Authenticator credential does not match this wallet.');
    }

    const response = assertion.response as AuthenticatorAssertionResponse;
    const clientData = JSON.parse(
      new TextDecoder().decode(response.clientDataJSON)
    ) as { type?: string; challenge?: string; origin?: string };

    if (clientData.type !== 'webauthn.get') {
      throw new Error('Unexpected WebAuthn assertion type.');
    }
    if (clientData.challenge !== challenge.b64Url) {
      throw new Error('WebAuthn challenge mismatch.');
    }
    if (clientData.origin !== window.location.origin) {
      throw new Error('WebAuthn origin mismatch.');
    }

    const authData = new Uint8Array(response.authenticatorData);
    const flags = authData[32] ?? 0;
    const userPresent = (flags & 0x01) !== 0;
    if (!userPresent) {
      throw new Error('Authenticator did not confirm user presence.');
    }

    return true;
  } catch (error) {
    throw parseWebAuthnError(error);
  }
}
