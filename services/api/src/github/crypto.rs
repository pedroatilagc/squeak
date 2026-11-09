//! Cifra de tokens em repouso: AES-256-GCM, nonce aleatório de 12 bytes prefixado ao texto cifrado, tudo em base64.
use aes_gcm::{aead::{Aead, KeyInit}, Aes256Gcm, Nonce};
use base64::{engine::general_purpose::STANDARD, Engine};
use rand::{rngs::OsRng, RngCore};

const NONCE_LEN: usize = 12;

#[derive(Debug, PartialEq, Eq)]
pub enum CryptoError {
    BadKey,
    Encrypt,
    /// Base64 inválido, texto curto demais ou autenticação falhou (adulteração/chave errada).
    Decrypt,
}

pub struct TokenCipher(Aes256Gcm);

impl TokenCipher {
    pub fn from_base64_key(b64: &str) -> Result<Self, CryptoError> {
        let raw = STANDARD.decode(b64.trim()).map_err(|_| CryptoError::BadKey)?;
        if raw.len() != 32 {
            return Err(CryptoError::BadKey);
        }
        Aes256Gcm::new_from_slice(&raw).map(Self).map_err(|_| CryptoError::BadKey)
    }

    /// Chave fixa só para o modo mock (nunca para credenciais reais).
    pub fn dev_key() -> Self {
        let raw = [0x5a_u8; 32];
        Self(Aes256Gcm::new_from_slice(&raw).expect("chave de 32 bytes"))
    }

    pub fn encrypt(&self, plain: &str) -> Result<String, CryptoError> {
        let mut nonce = [0u8; NONCE_LEN];
        OsRng.fill_bytes(&mut nonce);
        let ct = self.0.encrypt(Nonce::from_slice(&nonce), plain.as_bytes()).map_err(|_| CryptoError::Encrypt)?;
        let mut out = Vec::with_capacity(NONCE_LEN + ct.len());
        out.extend_from_slice(&nonce);
        out.extend_from_slice(&ct);
        Ok(STANDARD.encode(out))
    }

    pub fn decrypt(&self, enc: &str) -> Result<String, CryptoError> {
        let raw = STANDARD.decode(enc).map_err(|_| CryptoError::Decrypt)?;
        if raw.len() <= NONCE_LEN {
            return Err(CryptoError::Decrypt);
        }
        let (nonce, ct) = raw.split_at(NONCE_LEN);
        let pt = self.0.decrypt(Nonce::from_slice(nonce), ct).map_err(|_| CryptoError::Decrypt)?;
        String::from_utf8(pt).map_err(|_| CryptoError::Decrypt)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(byte: u8) -> String {
        STANDARD.encode([byte; 32])
    }

    #[test]
    fn roundtrip_and_unique_nonce() {
        let c = TokenCipher::from_base64_key(&key(1)).unwrap();
        let a = c.encrypt("gho_segredo").unwrap();
        let b = c.encrypt("gho_segredo").unwrap();
        assert_ne!(a, b, "nonce aleatório muda o resultado");
        assert!(!a.contains("gho_segredo"));
        assert_eq!(c.decrypt(&a).unwrap(), "gho_segredo");
        assert_eq!(c.decrypt(&b).unwrap(), "gho_segredo");
    }

    #[test]
    fn tampering_and_wrong_key_are_detected() {
        let c = TokenCipher::from_base64_key(&key(1)).unwrap();
        let enc = c.encrypt("token").unwrap();
        let mut raw = STANDARD.decode(&enc).unwrap();
        let last = raw.len() - 1;
        raw[last] ^= 0x01;
        assert_eq!(c.decrypt(&STANDARD.encode(&raw)), Err(CryptoError::Decrypt));
        let mut raw = STANDARD.decode(&enc).unwrap();
        raw[0] ^= 0x01; // adultera o nonce
        assert_eq!(c.decrypt(&STANDARD.encode(&raw)), Err(CryptoError::Decrypt));
        let other = TokenCipher::from_base64_key(&key(2)).unwrap();
        assert_eq!(other.decrypt(&enc), Err(CryptoError::Decrypt));
        assert_eq!(c.decrypt("curto"), Err(CryptoError::Decrypt));
    }

    #[test]
    fn key_must_be_32_bytes_base64() {
        assert!(TokenCipher::from_base64_key("").is_err());
        assert!(TokenCipher::from_base64_key("não é base64!").is_err());
        assert!(TokenCipher::from_base64_key(&STANDARD.encode([0u8; 16])).is_err());
    }
}
