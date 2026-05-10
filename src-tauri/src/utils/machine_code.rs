use sha2::{Sha256, Digest};
use sysinfo::System;
use tracing::info;

/// Generate machine code from hardware info
/// Uses platform-specific unique hardware identifiers (UUID, serial numbers, etc.)
/// IMPORTANT: Machine code must be deterministic - same hardware = same code
pub fn generate_machine_code() -> String {
    let mut hasher = Sha256::new();
    let mut has_valid_hardware_id = false;

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        // Get Platform UUID - this is a true hardware-level unique identifier
        if let Ok(output) = Command::new("ioreg").args(["-rd1", "-c", "IOPlatformExpertDevice"]).output() {
            let output_str = String::from_utf8_lossy(&output.stdout);
            if let Some(uuid_start) = output_str.find("IOPlatformUUID") {
                let uuid_line = &output_str[uuid_start..];
                if let Some(uuid) = uuid_line.lines().next() {
                    if let Some(eq_pos) = uuid.find('=') {
                        let uuid_value = uuid[eq_pos+1..].trim().trim_matches('"');
                        // Validate UUID format (should be 36 chars with dashes)
                        if uuid_value.len() == 36 && uuid_value.chars().filter(|&c| c == '-').count() == 4 {
                            hasher.update(uuid_value.as_bytes());
                            has_valid_hardware_id = true;
                        }
                    }
                }
            }
        }

        // If Platform UUID failed, try to get IOPlatformSerialNumber as fallback
        if !has_valid_hardware_id {
            if let Ok(output) = Command::new("ioreg").args(["-rd1", "-c", "IOPlatformExpertDevice"]).output() {
                let output_str = String::from_utf8_lossy(&output.stdout);
                if let Some(serial_start) = output_str.find("IOPlatformSerialNumber") {
                    let serial_line = &output_str[serial_start..];
                    if let Some(serial) = serial_line.lines().next() {
                        if let Some(eq_pos) = serial.find('=') {
                            let serial_value = serial[eq_pos+1..].trim().trim_matches('"');
                            if !serial_value.is_empty() && serial_value.len() >= 8 {
                                hasher.update(serial_value.as_bytes());
                                has_valid_hardware_id = true;
                            }
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        use std::fs;

        // Try to read product_uuid first (most reliable - unique per machine)
        if let Ok(uuid) = fs::read_to_string("/sys/class/dmi/id/product_uuid") {
            let uuid = uuid.trim();
            if !uuid.is_empty() && uuid.len() >= 8 && uuid != "00000000-0000-0000-0000-000000000000" {
                hasher.update(uuid.as_bytes());
                has_valid_hardware_id = true;
            }
        }

        // Also read chassis_uuid as additional identifier
        if let Ok(uuid) = fs::read_to_string("/sys/class/dmi/id/chassis_uuid") {
            let uuid = uuid.trim();
            if !uuid.is_empty() && uuid != "00000000-0000-0000-0000-000000000000" {
                hasher.update(uuid.as_bytes());
            }
        }

        // Read board serial number
        if let Ok(serial) = fs::read_to_string("/sys/class/dmi/id/board_serial") {
            let serial = serial.trim();
            if !serial.is_empty() && serial != "None" && serial != "To be filled by O.E.M." {
                hasher.update(serial.as_bytes());
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        // Try multiple methods to get hardware identifier

        // Helper to run PowerShell without showing window
        let run_powershell = |cmd: &str| -> Option<String> {
            Command::new("powershell")
                .args(["-WindowStyle", "Hidden", "-NoProfile", "-Command", cmd])
                .output()
                .ok()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        };

        // Method 1: PowerShell Get-CimInstance (most reliable on modern Windows)
        if !has_valid_hardware_id {
            if let Some(uuid) = run_powershell("(Get-CimInstance Win32_ComputerSystemProduct).UUID") {
                info!(module="machine_code", "PowerShell UUID output: '{}'", uuid);
                if !uuid.is_empty() && !uuid.contains("00000000")
                   && !uuid.contains("AAAAAAAA") && uuid.len() >= 32 {
                    hasher.update(uuid.as_bytes());
                    has_valid_hardware_id = true;
                    info!(module="machine_code", "Using PowerShell UUID: {}", uuid);
                }
            }
        }

        // Method 2: wmic csproduct (fallback)
        if !has_valid_hardware_id {
            if let Ok(output) = Command::new("wmic").args(["csproduct", "get", "UUID"]).output() {
                let uuid_str = String::from_utf8_lossy(&output.stdout);
                info!(module="machine_code", "wmic csproduct output: '{}'", uuid_str);
                if let Some(last_line) = uuid_str.lines().last() {
                    let uuid = last_line.trim();
                    info!(module="machine_code", "wmic last line: '{}'", uuid);
                    if !uuid.is_empty() && uuid != "UUID"
                       && !uuid.contains("00000000")
                       && !uuid.contains("AAAAAAAA")
                       && uuid.len() >= 32 {
                        hasher.update(uuid.as_bytes());
                        has_valid_hardware_id = true;
                        info!(module="machine_code", "Using wmic UUID: {}", uuid);
                    }
                }
            }
        }

        // Method 3: Base board serial
        if !has_valid_hardware_id {
            if let Some(serial) = run_powershell("(Get-CimInstance Win32_BaseBoard).SerialNumber") {
                info!(module="machine_code", "BaseBoard Serial: '{}'", serial);
                if !serial.is_empty() && !serial.contains("To be filled") && !serial.contains("None") && serial.len() >= 8 {
                    hasher.update(serial.as_bytes());
                    has_valid_hardware_id = true;
                }
            }
        }

        // Method 4: BIOS serial
        if !has_valid_hardware_id {
            if let Some(serial) = run_powershell("(Get-CimInstance Win32_BIOS).SerialNumber") {
                info!(module="machine_code", "BIOS Serial: '{}'", serial);
                if !serial.is_empty() && !serial.contains("To be filled") && !serial.contains("None") && serial.len() >= 8 {
                    hasher.update(serial.as_bytes());
                    has_valid_hardware_id = true;
                }
            }
        }

        // Method 5: Board product UUID from registry
        if !has_valid_hardware_id {
            if let Some(uuid) = run_powershell("(Get-ItemProperty 'HKLM:\\HARDWARE\\DESCRIPTION\\System\\BIOS').SystemProductUUID") {
                info!(module="machine_code", "Registry UUID: '{}'", uuid);
                if !uuid.is_empty() && uuid != "00000000-0000-0000-0000-000000000000" && uuid.len() >= 36 {
                    hasher.update(uuid.as_bytes());
                    has_valid_hardware_id = true;
                }
            }
        }
    }

    // Fallback: only use if no valid hardware ID was found
    // IMPORTANT: No random component - machine code must be deterministic!
    if !has_valid_hardware_id {
        info!(module="machine_code", "No valid hardware ID found, using fallback");
        let mut sys = System::new();
        // Use multiple stable identifiers
        if let Some(name) = System::name() {
            info!(module="machine_code", "Using system name: {}", name);
            hasher.update(name.as_bytes());
        }
        if let Some(host) = System::host_name() {
            info!(module="machine_code", "Using host name: {}", host);
            hasher.update(host.as_bytes());
        }
        // Use kernel build string as additional identifier
        info!(module="machine_code", "Using OS: {}, ARCH: {}", std::env::consts::OS, std::env::consts::ARCH);
        hasher.update(std::env::consts::OS.as_bytes());
        hasher.update(std::env::consts::ARCH.as_bytes());
    } else {
        info!(module="machine_code", "Using hardware ID for machine code");
    }

    let result = hasher.finalize();
    format!("{:X}", result)
}
