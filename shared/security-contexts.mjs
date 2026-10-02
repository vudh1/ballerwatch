/**
 * Domain-separation labels for keys derived from the BallerWatch master secret.
 *
 * Keep labels stable after deployment. Changing a label intentionally invalidates
 * or migrates the cryptographic material in that domain.
 */
export const KEY_CONTEXT = Object.freeze({
  stateEncryption: "ballerwatch:state-encryption:v1",
  userTokenSigning: "ballerwatch:user-token-signing:v1",
  feedbackTokenSigning: "ballerwatch:feedback-token-signing:v1",
  passwordVerifier: "ballerwatch:user-password-verifier:v1",
  pushChallengeSigning: "ballerwatch:push-registration-challenge:v1",
});
