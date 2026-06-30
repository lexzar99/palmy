import SwiftUI

struct SponsorRail: View {
    let sponsors: [Sponsor]
    let loading: Bool
    @State private var currentIndex = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Aktuellt", subtitle: "Partnerkampanjer nära dig")

            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        if loading && sponsors.isEmpty {
                            ForEach(0..<2, id: \.self) { _ in
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .fill(Color.white.opacity(0.7))
                                    .frame(width: 330, height: 174)
                                    .redacted(reason: .placeholder)
                            }
                        } else {
                            ForEach(Array(sponsors.enumerated()), id: \.element.id) { index, sponsor in
                                SponsorCard(sponsor: sponsor)
                                    .id(index)
                            }
                        }
                    }
                    .padding(.trailing, 20)
                }
                .onReceive(Timer.publish(every: 3.6, on: .main, in: .common).autoconnect()) { _ in
                    guard sponsors.count > 1 else { return }
                    currentIndex = (currentIndex + 1) % sponsors.count
                    withAnimation(.spring(response: 0.65, dampingFraction: 0.88)) {
                        proxy.scrollTo(currentIndex, anchor: .leading)
                    }
                }
            }
        }
    }
}

struct SponsorCard: View {
    let sponsor: Sponsor
    private var showText: Bool {
        sponsor.imageOnly != true && sponsor.showName != false
    }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            RemoteImage(urlString: sponsor.imageUrl)
                .frame(width: 330, height: 174)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

            if showText {
                LinearGradient(colors: [.clear, .black.opacity(0.82)], startPoint: .top, endPoint: .bottom)

                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 7) {
                        Text(sponsor.tier?.isEmpty == false ? sponsor.tier! : "Partner")
                            .font(.system(size: 11, weight: .black))
                        if sponsor.isClickable == true {
                            Image(systemName: "arrow.up.right")
                                .font(.system(size: 10, weight: .black))
                        }
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(DeliveraTheme.orange, in: Capsule())

                    Text(sponsor.name)
                        .font(.system(size: 24, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                }
                .padding(16)
            }
        }
        .frame(width: 330, height: 174)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(.white.opacity(0.42), lineWidth: 1))
        .cardShadow()
    }
}
