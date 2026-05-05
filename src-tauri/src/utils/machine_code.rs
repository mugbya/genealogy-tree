use sha2::{Sha256, Digest};
use sysinfo::System;

/// Generate machine code from hardware info
/// Uses platform-specific unique hardware identifiers (UUID, serial numbers, etc.)
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

    #[cfg(target_windows)]
    {
        use std::process::Command;

        // Use wmic to get BIOS UUID (unique per machine)
        if let Ok(output) = Command::new("wmic").args(["csproduct", "get", "UUID"]).output() {
            let uuid = String::from_utf8_lossy(&output.stdout);
            if let Some(last_line) = uuid.lines().last() {
                let uuid = last_line.trim();
                if !uuid.is_empty() && uuid != "UUID" && !uuid.contains("00000000-0000-0000-0000-000000000000") {
                    hasher.update(uuid.as_bytes());
                    has_valid_hardware_id = true;
                }
            }
        }

        // Get CPU ID as additional identifier
        if let Ok(output) = std::process::Command::new("wmic").args(["cpu", "get", "ProcessorId"]).output() {
            let cpu_id = String::from_utf8_lossy(&output.stdout);
            if let Some(last_line) = cpu_id.lines().last() {
                let cpu_id = last_line.trim();
                if !cpu_id.is_empty() && cpu_id != "ProcessorId" {
                    hasher.update(cpu_id.as_bytes());
                }
            }
        }

        // Get BIOS serial number
        if let Ok(output) = std::process::Command::new("wmic").args(["bios", "get", "SerialNumber"]).output() {
            let serial = String::from_utf8_lossy(&output.stdout);
            if let Some(last_line) = serial.lines().last() {
                let serial = last_line.trim();
                if !serial.is_empty() && serial != "SerialNumber" && !serial.contains("To be filled") {
                    hasher.update(serial.as_bytes());
                }
            }
        }
    }

    // Fallback: only use if no valid hardware ID was found
    // This ensures we don't generate duplicate machine codes for different machines
    if !has_valid_hardware_id {
        let _sys = System::new();
        hasher.update(System::name().unwrap_or_default().as_bytes());
        hasher.update(System::host_name().unwrap_or_default().as_bytes());
        // Add a random component to reduce collision probability
        hasher.update(rand::random::<u64>().to_string().as_bytes());
    }

    let result = hasher.finalize();
    format!("{:X}", result)
}