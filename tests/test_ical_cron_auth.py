import base64
import json
import time
import unittest
from unittest import mock

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa

import app


def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


class GitHubOidcCronTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        numbers = cls.private_key.public_key().public_numbers()
        cls.jwk = {
            "kid": "test-key",
            "kty": "RSA",
            "n": b64url(numbers.n.to_bytes((numbers.n.bit_length() + 7) // 8, "big")),
            "e": b64url(numbers.e.to_bytes((numbers.e.bit_length() + 7) // 8, "big")),
        }

    def make_token(self, **claim_overrides):
        now = int(time.time())
        header = {"alg": "RS256", "kid": "test-key", "typ": "JWT"}
        claims = {
            "iss": app.PMS_GITHUB_OIDC_ISSUER,
            "aud": app.PMS_GITHUB_OIDC_AUDIENCE,
            "iat": now,
            "nbf": now - 5,
            "exp": now + 300,
            "repository": app.PMS_GITHUB_OIDC_REPOSITORY,
            "ref": "refs/heads/main",
            "sub": f"repo:{app.PMS_GITHUB_OIDC_REPOSITORY}:ref:refs/heads/main",
            "workflow_ref": app.PMS_GITHUB_OIDC_WORKFLOW_REF,
            "event_name": "schedule",
            "run_id": "12345",
        }
        claims.update(claim_overrides)
        encoded_header = b64url(json.dumps(header, separators=(",", ":")).encode("utf-8"))
        encoded_claims = b64url(json.dumps(claims, separators=(",", ":")).encode("utf-8"))
        signing_input = f"{encoded_header}.{encoded_claims}".encode("ascii")
        signature = self.private_key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
        return f"{encoded_header}.{encoded_claims}.{b64url(signature)}"

    def verify(self, token):
        with mock.patch.object(app, "_pms_load_github_oidc_jwks", return_value=[self.jwk]):
            return app._pms_verify_github_oidc_token(token)

    def test_accepts_scheduled_main_workflow_token(self):
        self.assertEqual(self.verify(self.make_token())["run_id"], "12345")

    def test_accepts_manual_dispatch_for_same_workflow(self):
        self.assertEqual(self.verify(self.make_token(event_name="workflow_dispatch"))["event_name"], "workflow_dispatch")

    def test_rejects_wrong_repository(self):
        with self.assertRaisesRegex(ValueError, "repository"):
            self.verify(self.make_token(repository="attacker/fork"))

    def test_rejects_wrong_workflow(self):
        with self.assertRaisesRegex(ValueError, "workflow"):
            self.verify(self.make_token(workflow_ref="caiping5393559-hash/pms-system/.github/workflows/other.yml@refs/heads/main"))

    def test_rejects_tampered_signature(self):
        header, claims, encoded_signature = self.make_token().split(".")
        signature = bytearray(app._pms_base64url_decode(encoded_signature))
        signature[0] ^= 1
        token = f"{header}.{claims}.{b64url(bytes(signature))}"
        with self.assertRaisesRegex(ValueError, "signature"):
            self.verify(token)


if __name__ == "__main__":
    unittest.main()
