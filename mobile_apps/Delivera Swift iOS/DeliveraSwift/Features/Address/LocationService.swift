import CoreLocation
import Foundation

@MainActor
final class LocationService: NSObject, ObservableObject {
    @Published var authorizationStatus: CLAuthorizationStatus
    @Published var latestLocation: CLLocation?
    @Published var errorMessage: String?

    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<CLLocation, Error>?

    override init() {
        authorizationStatus = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func requestLocation() async throws -> CLLocation {
        errorMessage = nil

        if authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            manager.requestLocation()
        }
    }
}

extension LocationService: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            authorizationStatus = status
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        Task { @MainActor in
            latestLocation = location
            continuation?.resume(returning: location)
            continuation = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            errorMessage = "Kunde inte hämta din plats."
            continuation?.resume(throwing: error)
            continuation = nil
        }
    }
}
