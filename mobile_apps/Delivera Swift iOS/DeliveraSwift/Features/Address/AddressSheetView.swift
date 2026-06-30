import SwiftUI

struct AddressSheetView: View {
    @Binding var deliveryAddress: String
    @Binding var deliveryCityName: String
    @Binding var deliveryCoordinate: Coordinate?
    @Binding var pickupCityName: String
    @Binding var recentDeliveryAddresses: [String]
    @Binding var mode: OrderMode
    let cities: [City]

    @Environment(\.dismiss) private var dismiss
    @StateObject private var locationService = LocationService()
    @State private var draftAddress = ""
    @State private var selectedCity: City?
    @State private var predictions: [PlacePrediction] = []
    @State private var sessionToken = UUID().uuidString
    @State private var isResolvingLocation = false
    @State private var addressError: String?
    @State private var hasEditedAddress = false
    @State private var autocompleteTask: Task<Void, Never>?

    private let api = DeliveraAPI()

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Välj adress")
                        .font(.system(size: 29, weight: .black, design: .rounded))
                        .foregroundStyle(DeliveraTheme.ink)
                    Text(mode == .delivery ? "Vi visar restauranger som kan leverera hit." : "Välj stad och hämta maten själv.")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(DeliveraTheme.muted)
                }
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .black))
                        .foregroundStyle(DeliveraTheme.ink)
                        .frame(width: 36, height: 36)
                        .background(Color.black.opacity(0.06), in: Circle())
                }
                .buttonStyle(.plain)
            }

            HStack(spacing: 8) {
                ForEach(OrderMode.allCases) { item in
                    Button {
                        mode = item
                        if item == .pickup {
                            selectedCity = city(named: deliveryCityName) ?? selectedCity ?? cities.first
                        }
                    } label: {
                        HStack(spacing: 7) {
                            Image(systemName: item.systemImage)
                            Text(item.title)
                        }
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(mode == item ? .white : DeliveraTheme.ink.opacity(0.62))
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(mode == item ? DeliveraTheme.ink : Color.white, in: Capsule())
                        .overlay(Capsule().stroke(DeliveraTheme.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }

            if mode == .delivery {
                deliveryContent
            } else {
                pickupContent
            }

            Spacer(minLength: 0)

            Button {
                if mode == .delivery {
                    let trimmed = draftAddress.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !trimmed.isEmpty {
                        deliveryAddress = trimmed
                        rememberAddress(trimmed)
                    }
                } else if let selectedCity {
                    pickupCityName = selectedCity.name
                }
                dismiss()
            } label: {
                Text("Bekräfta")
                    .font(.system(size: 16, weight: .black))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 56)
                    .background(DeliveraTheme.orange, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .shadow(color: DeliveraTheme.orange.opacity(0.28), radius: 16, y: 10)
            }
            .buttonStyle(.plain)
        }
        .padding(22)
        .background(DeliveraTheme.appBackground.ignoresSafeArea())
        .onAppear {
            draftAddress = deliveryAddress
            selectedCity = city(named: pickupCityName) ?? city(named: deliveryCityName) ?? cities.first
            rememberAddress(deliveryAddress)
        }
    }

    private var deliveryContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "location.magnifyingglass")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(DeliveraTheme.orange)
                TextField("Gata, område eller stad", text: Binding(
                    get: { draftAddress },
                    set: { value in
                        draftAddress = value
                        hasEditedAddress = true
                        searchPlaces(value)
                    }
                ))
                    .textInputAutocapitalization(.words)
                    .font(.system(size: 16, weight: .bold))
            }
            .padding(.horizontal, 14)
            .frame(height: 54)
            .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))

            if hasEditedAddress && !predictions.isEmpty {
                VStack(spacing: 6) {
                    ForEach(predictions.prefix(4)) { prediction in
                        Button {
                            Task { await selectPrediction(prediction) }
                        } label: {
                            PredictionRow(title: prediction.description)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .frame(maxHeight: 190)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }

            Button {
                Task { await useCurrentLocation() }
            } label: {
                AddressRow(
                    symbol: isResolvingLocation ? "location.circle" : "paperplane.fill",
                    title: isResolvingLocation ? "Hämtar plats..." : "Använd min position",
                    subtitle: "Hämta adress automatiskt",
                    accent: DeliveraTheme.orange
                )
            }
            .buttonStyle(.plain)
            .disabled(isResolvingLocation)

            if !recentDeliveryAddresses.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Senast valda")
                        .font(.system(size: 12, weight: .black))
                        .foregroundStyle(DeliveraTheme.muted)
                    ForEach(recentDeliveryAddresses.prefix(3), id: \.self) { address in
                        Button {
                            draftAddress = address
                            deliveryAddress = address
                            predictions = []
                            hasEditedAddress = false
                        } label: {
                            AddressRow(symbol: "clock.arrow.circlepath", title: address, subtitle: "Adress", accent: DeliveraTheme.ink)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            if let addressError {
                Text(addressError)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(DeliveraTheme.orange)
            }
        }
    }

    private var pickupContent: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Tillgängliga städer")
                .font(.system(size: 13, weight: .black))
                .foregroundStyle(DeliveraTheme.muted)

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 128), spacing: 10)], spacing: 10) {
                ForEach(cities) { city in
                    Button {
                        selectedCity = city
                    } label: {
                        HStack {
                            Text(city.name)
                                .font(.system(size: 14, weight: .black))
                                .foregroundStyle(selectedCity == city ? .white : DeliveraTheme.ink)
                            Spacer()
                            if selectedCity == city {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 12, weight: .black))
                                    .foregroundStyle(.white)
                            }
                        }
                        .padding(.horizontal, 12)
                        .frame(height: 44)
                        .background(selectedCity == city ? DeliveraTheme.orange : Color.white, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func searchPlaces(_ value: String) {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        autocompleteTask?.cancel()
        guard mode == .delivery, hasEditedAddress, trimmed.count >= 3 else {
            predictions = []
            return
        }

        let token = sessionToken
        autocompleteTask = Task {
            try? await Task.sleep(for: .milliseconds(280))
            guard !Task.isCancelled else { return }
            do {
                let result = try await api.autocompletePlaces(input: trimmed, sessionToken: token)
                await MainActor.run {
                    if hasEditedAddress && draftAddress.trimmingCharacters(in: .whitespacesAndNewlines) == trimmed {
                        predictions = result
                    }
                }
            } catch {
                await MainActor.run { predictions = [] }
            }
        }
    }

    private func selectPrediction(_ prediction: PlacePrediction) async {
        do {
            let geocode = try await api.geocodePlace(placeID: prediction.placeID, sessionToken: sessionToken)
            deliveryAddress = prediction.description
            draftAddress = prediction.description
            rememberAddress(prediction.description)
            deliveryCoordinate = geocode.location
            deliveryCityName = geocode.city ?? deliveryCityName
            pickupCityName = deliveryCityName
            predictions = []
            hasEditedAddress = false
            sessionToken = UUID().uuidString
        } catch {
            addressError = "Kunde inte välja adressen."
        }
    }

    private func useCurrentLocation() async {
        isResolvingLocation = true
        addressError = nil
        defer { isResolvingLocation = false }

        do {
            let location = try await locationService.requestLocation()
            let reverse = try await api.reverseGeocode(
                latitude: location.coordinate.latitude,
                longitude: location.coordinate.longitude
            )
            deliveryAddress = reverse.address
            draftAddress = reverse.address
            rememberAddress(reverse.address)
            deliveryCoordinate = Coordinate(lat: location.coordinate.latitude, lng: location.coordinate.longitude)
            deliveryCityName = reverse.city ?? deliveryCityName
            pickupCityName = deliveryCityName
            predictions = []
            hasEditedAddress = false
        } catch {
            addressError = "Kunde inte hämta platsen. Kontrollera platsbehörighet."
        }
    }

    private func rememberAddress(_ address: String) {
        let trimmed = address.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        var next = recentDeliveryAddresses.filter { $0.localizedCaseInsensitiveCompare(trimmed) != .orderedSame }
        next.insert(trimmed, at: 0)
        recentDeliveryAddresses = Array(next.prefix(3))
    }

    private func city(named name: String) -> City? {
        cities.first { $0.name.localizedCaseInsensitiveCompare(name) == .orderedSame }
    }
}

private struct PredictionRow: View {
    let title: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "mappin.and.ellipse")
                .font(.system(size: 13, weight: .black))
                .foregroundStyle(DeliveraTheme.orange)
                .frame(width: 30, height: 30)
                .background(DeliveraTheme.orange.opacity(0.1), in: Circle())
            Text(title)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(DeliveraTheme.ink)
                .lineLimit(1)
            Spacer()
        }
        .padding(.horizontal, 12)
        .frame(height: 44)
        .background(.white, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }
}

private struct AddressRow: View {
    let symbol: String
    let title: String
    let subtitle: String
    let accent: Color

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .black))
                .foregroundStyle(accent)
                .frame(width: 38, height: 38)
                .background(accent.opacity(0.1), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: .black))
                    .foregroundStyle(DeliveraTheme.ink)
                    .lineLimit(1)
                Text(subtitle)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(DeliveraTheme.muted)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .black))
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .background(.white.opacity(0.82), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }
}
