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

        // Helper to run command without showing window on Windows
        let run_hidden = |program: &str, args: &[&str]| -> Option<String> {
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                let mut cmd = Command::new(program);
                cmd.args(args);
                // CREATE_NO_WINDOW flag hides the console window
                cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW = 0x08000000
                cmd.output().ok().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            }
            #[cfg(not(target_os = "windows"))]
            {
                let output = Command::new(program).args(args).output().ok()?;
                Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
            }
        };

        // Try multiple methods to get hardware identifier
        // Priority: wmic (fast, no PowerShell overhead) > PowerShell

        // Method 1: wmic csproduct (fastest - no PowerShell startup overhead)
        if !has_valid_hardware_id {
            if let Some(output) = run_hidden("wmic", &["csproduct", "get", "UUID"]) {
                info!(module="machine_code", "wmic output: '{}'", output);
                if let Some(last_line) = output.lines().last() {
                    let uuid = last_line.trim();
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

        // Method 2: wmic baseboard serial
        if !has_valid_hardware_id {
            if let Some(output) = run_hidden("wmic", &["baseboard", "get", "SerialNumber"]) {
                info!(module="machine_code", "wmic baseboard: '{}'", output);
                if let Some(last_line) = output.lines().last() {
                    let serial = last_line.trim();
                    if !serial.is_empty() && serial != "SerialNumber"
                       && !serial.contains("To be filled") && !serial.contains("None") && serial.len() >= 8 {
                        hasher.update(serial.as_bytes());
                        has_valid_hardware_id = true;
                        info!(module="machine_code", "Using wmic baseboard serial: {}", serial);
                    }
                }
            }
        }

        // Method 3: wmic bios serial
        if !has_valid_hardware_id {
            if let Some(output) = run_hidden("wmic", &["bios", "get", "SerialNumber"]) {
                info!(module="machine_code", "wmic bios: '{}'", output);
                if let Some(last_line) = output.lines().last() {
                    let serial = last_line.trim();
                    if !serial.is_empty() && serial != "SerialNumber"
                       && !serial.contains("To be filled") && !serial.contains("None") && serial.len() >= 8 {
                        hasher.update(serial.as_bytes());
                        has_valid_hardware_id = true;
                        info!(module="machine_code", "Using wmic bios serial: {}", serial);
                    }
                }
            }
        }

        // Method 4: PowerShell Get-CimInstance (fallback, slightly slower due to PowerShell startup)
        if !has_valid_hardware_id {
            let ps_cmd = "(Get-CimInstance Win32_ComputerSystemProduct).UUID";
            if let Some(output) = run_hidden("powershell", &["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd]) {
                info!(module="machine_code", "PowerShell UUID output: '{}'", output);
                if !output.is_empty() && !output.contains("00000000") && !output.contains("AAAAAAAA") && output.len() >= 32 {
                    hasher.update(output.as_bytes());
                    has_valid_hardware_id = true;
                    info!(module="machine_code", "Using PowerShell UUID: {}", output);
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
