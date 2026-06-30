import SwiftUI

struct RemoteImage: View {
    let urlString: String?
    var contentMode: ContentMode = .fill
    var showsFailureIcon = true

    private var hasURL: Bool {
        guard let urlString else { return false }
        return !urlString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        AsyncImage(url: hasURL ? URL(string: urlString ?? "") : nil) { phase in
            switch phase {
            case .empty:
                if hasURL {
                    placeholder.overlay(ProgressView().controlSize(.small))
                } else {
                    placeholder
                }
            case .success(let image):
                image
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            case .failure:
                if showsFailureIcon {
                    placeholder.overlay(
                        Image(systemName: "photo")
                            .font(.system(size: 25, weight: .bold))
                            .foregroundStyle(DeliveraTheme.ink.opacity(0.24))
                    )
                } else {
                    placeholder
                }
            @unknown default:
                placeholder
            }
        }
        .clipped()
    }

    private var placeholder: some View {
        LinearGradient(
            colors: [Color.white.opacity(0.7), DeliveraTheme.orange.opacity(0.14)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}
