use parking_lot::Mutex;
use std::collections::{HashMap, HashSet};

const SERVICE: &str = "mj-desktop";

/// Where a secret actually ended up. V7 fix (bug W): `set` used to fall back to an in-process
/// HashMap and still return `Ok(())`, so the UI confirmed a key was stored in the OS keychain when
/// in fact it lived only in RAM and was gone at the next restart. The store now reports the truth
/// and remembers which refs are in that degraded state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SecretLocation {
    /// Written to the OS credential store; survives restarts.
    Keychain,
    /// Held in process memory only; lost on exit.
    MemoryOnly,
    /// Not stored anywhere.
    Absent,
}

pub struct SecretStore {
    fallback: Mutex<HashMap<String, String>>,
    /// Refs currently held only in memory, i.e. NOT protected by the OS keychain.
    degraded: Mutex<HashSet<String>>,
}

impl SecretStore {
    pub fn new() -> Self {
        Self { fallback: Mutex::new(HashMap::new()), degraded: Mutex::new(HashSet::new()) }
    }

    pub fn set(&self, secret_ref: &str, value: &str) -> Result<SecretLocation, String> {
        match keyring::Entry::new(SERVICE, secret_ref) {
            Ok(entry) => {
                if entry.set_password(value).is_ok() {
                    self.degraded.lock().remove(secret_ref);
                    return Ok(SecretLocation::Keychain);
                }
            }
            Err(_) => {}
        }
        self.fallback.lock().insert(secret_ref.to_string(), value.to_string());
        self.degraded.lock().insert(secret_ref.to_string());
        Ok(SecretLocation::MemoryOnly)
    }

    /// Refs that are stored only in memory and will be lost when the app exits.
    #[allow(dead_code)]
    pub fn degraded_refs(&self) -> Vec<String> {
        let mut v: Vec<String> = self.degraded.lock().iter().cloned().collect();
        v.sort();
        v
    }

    pub fn location(&self, secret_ref: &str) -> SecretLocation {
        if self.degraded.lock().contains(secret_ref) {
            return SecretLocation::MemoryOnly;
        }
        if let Ok(entry) = keyring::Entry::new(SERVICE, secret_ref) {
            if entry.get_password().is_ok() {
                return SecretLocation::Keychain;
            }
        }
        if self.fallback.lock().contains_key(secret_ref) {
            SecretLocation::MemoryOnly
        } else {
            SecretLocation::Absent
        }
    }

    pub fn delete(&self, secret_ref: &str) -> Result<(), String> {
        if let Ok(entry) = keyring::Entry::new(SERVICE, secret_ref) {
            let _ = entry.delete_credential();
        }
        self.fallback.lock().remove(secret_ref);
        self.degraded.lock().remove(secret_ref);
        Ok(())
    }

    pub fn get(&self, secret_ref: &str) -> Option<String> {
        if let Ok(entry) = keyring::Entry::new(SERVICE, secret_ref) {
            if let Ok(v) = entry.get_password() {
                return Some(v);
            }
        }
        self.fallback.lock().get(secret_ref).cloned()
    }

    #[allow(dead_code)]
    pub fn exists(&self, refs: &[String]) -> HashMap<String, bool> {
        refs.iter().map(|r| (r.clone(), self.get(r).is_some())).collect()
    }
}
