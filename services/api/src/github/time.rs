//! Datas ISO 8601 UTC sem dependência externa (algoritmos de calendário civil de Howard Hinnant).

pub fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

pub fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// 0 = domingo (1970-01-01 foi quinta).
pub fn weekday_of_day(days: i64) -> i64 {
    (days + 4).rem_euclid(7)
}

pub fn fmt_secs(secs: i64) -> String {
    let days = secs.div_euclid(86400);
    let rem = secs.rem_euclid(86400);
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

pub fn fmt_date(days: i64) -> String {
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}")
}

pub fn now_secs() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

pub fn now_iso() -> String {
    fmt_secs(now_secs())
}

/// Aceita `YYYY-MM-DD` e `YYYY-MM-DDTHH:MM:SS[.fff](Z|±HH:MM)`. Devolve segundos UTC.
pub fn parse_iso(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() < 10 || b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    let num = |r: std::ops::Range<usize>| -> Option<i64> {
        let part = s.get(r)?;
        if part.is_empty() || !part.bytes().all(|c| c.is_ascii_digit()) {
            return None;
        }
        part.parse().ok()
    };
    let (y, m, d) = (num(0..4)?, num(5..7)?, num(8..10)?);
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    let days = days_from_civil(y, m, d);
    if civil_from_days(days) != (y, m, d) {
        return None; // dia inexistente (ex.: 31 de fevereiro)
    }
    if b.len() == 10 {
        return Some(days * 86400);
    }
    if b[10] != b'T' || b.len() < 20 || b[13] != b':' || b[16] != b':' {
        return None;
    }
    let (hh, mm, ss) = (num(11..13)?, num(14..16)?, num(17..19)?);
    if hh > 23 || mm > 59 || ss > 60 {
        return None;
    }
    let mut i = 19;
    if b[i] == b'.' {
        i += 1;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
    }
    let offset = match b.get(i) {
        Some(b'Z') if i + 1 == b.len() => 0,
        Some(sign @ (b'+' | b'-')) if b.len() == i + 6 && b[i + 3] == b':' => {
            let oh = num(i + 1..i + 3)?;
            let om = num(i + 4..i + 6)?;
            let o = oh * 3600 + om * 60;
            if *sign == b'+' { o } else { -o }
        }
        _ => return None,
    };
    Some(days * 86400 + hh * 3600 + mm * 60 + ss - offset)
}

/// Normaliza qualquer data aceita para `YYYY-MM-DDTHH:MM:SSZ` (ordena como texto).
pub fn normalize(s: &str) -> Option<String> {
    parse_iso(s).map(fmt_secs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_and_offsets() {
        assert_eq!(fmt_secs(0), "1970-01-01T00:00:00Z");
        assert_eq!(parse_iso("2026-11-08T12:00:00Z").map(fmt_secs).unwrap(), "2026-11-08T12:00:00Z");
        assert_eq!(normalize("2026-11-08T10:00:00-03:00").unwrap(), "2026-11-08T13:00:00Z");
        assert_eq!(normalize("2024-02-29").unwrap(), "2024-02-29T00:00:00Z");
        assert!(parse_iso("2025-02-29").is_none());
        assert!(parse_iso("ontem").is_none());
        assert_eq!(weekday_of_day(days_from_civil(2025, 1, 5)), 0, "5/1/2025 foi domingo");
    }
}
