import Foundation

enum RestaurantAvailability {
    private static let weekdayKeys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    private static let weekdayShort = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"]

    static func statusLabel(for restaurant: Restaurant, now: Date = Date()) -> String? {
        if restaurant.comingSoon == true { return "Kommer snart" }

        if let pausedUntil = restaurant.pausedUntil,
           let date = ISO8601DateFormatter.parseFlexible(pausedUntil),
           date > now {
            return "Pausad · \(Self.timeString(from: date))"
        }

        if restaurant.isOpen == false {
            return nextOpenLabel(openingHours: restaurant.openingHours, now: now) ?? "Stängt"
        }

        return nil
    }

    static func isDimmed(_ restaurant: Restaurant) -> Bool {
        restaurant.comingSoon == true || restaurant.isOpen == false
    }

    static func isAccessible(_ restaurant: Restaurant) -> Bool {
        restaurant.comingSoon != true
    }

    static func isOrderingEnabled(_ restaurant: Restaurant) -> Bool {
        restaurant.comingSoon != true && restaurant.isOpen != false
    }

    static func nextOpenLabel(openingHours: RestaurantOpeningHours?, now: Date = Date()) -> String? {
        guard let openingHours else { return nil }

        let calendar = Calendar.current
        let todayIndex = calendar.component(.weekday, from: now) - 1
        let nowComponents = calendar.dateComponents([.hour, .minute], from: now)
        let nowMinutes = (nowComponents.hour ?? 0) * 60 + (nowComponents.minute ?? 0)

        for offset in 0..<7 {
            let dayIndex = (todayIndex + offset) % 7
            guard let day = openingHours.days[weekdayKeys[dayIndex]], !day.closed else { continue }

            let slots = day.slots
                .filter { $0.open.contains(":") }
                .sorted { minutes(from: $0.open) < minutes(from: $1.open) }

            for slot in slots {
                let openMinutes = minutes(from: slot.open)
                if offset == 0 && openMinutes <= nowMinutes { continue }
                if offset == 0 { return "Öppnar \(slot.open)" }
                if offset == 1 { return "Öppnar imorgon \(slot.open)" }
                return "Öppnar \(weekdayShort[dayIndex]) \(slot.open)"
            }
        }

        return nil
    }

    private static func minutes(from value: String) -> Int {
        let parts = value.split(separator: ":").compactMap { Int($0) }
        guard let hour = parts.first else { return Int.max }
        return hour * 60 + (parts.dropFirst().first ?? 0)
    }

    private static func timeString(from date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "sv_SE")
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
}

private extension ISO8601DateFormatter {
    static func parseFlexible(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) { return date }

        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: value)
    }
}
