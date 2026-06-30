import SwiftUI

struct ProfileView: View {
    @State private var orders = TrackingOrder.samples
    @State private var selectedIndex = 0
    @State private var receiptOrder: TrackingOrder?
    @State private var infoOrder: TrackingOrder?
    @State private var appeared = false

    var body: some View {
        ZStack {
            DeliveraTheme.appBackground.ignoresSafeArea()

            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    header

                    TabView(selection: $selectedIndex) {
                        ForEach(Array(orders.enumerated()), id: \.element.id) { index, order in
                            TrackingPage(
                                order: order,
                                style: TrackingShowcaseStyle.allCases[index % TrackingShowcaseStyle.allCases.count],
                                onReceipt: { receiptOrder = order },
                                onInfo: { infoOrder = order },
                                onContact: {}
                            )
                            .padding(.horizontal, 20)
                            .tag(index)
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                    .frame(height: 604)

                    trackingDots
                    profileActions
                }
                .padding(.top, 18)
                .padding(.bottom, 112)
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 18)
            }
        }
        .task {
            withAnimation(.spring(response: 0.58, dampingFraction: 0.84)) {
                appeared = true
            }
        }
        .sheet(item: $receiptOrder) { order in
            ReceiptView(order: order)
                .presentationDetents([.fraction(0.82), .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(item: $infoOrder) { order in
            OrderInfoView(order: order)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Profil")
                        .font(.system(size: 34, weight: .black, design: .rounded))
                        .foregroundStyle(DeliveraTheme.ink)
                    Text("Följ dina ordrar live")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(DeliveraTheme.muted)
                }
                Spacer()
                Image(systemName: "person.crop.circle.fill")
                    .font(.system(size: 38, weight: .black))
                    .foregroundStyle(DeliveraTheme.ink)
                    .frame(width: 54, height: 54)
                    .background(.white, in: Circle())
                    .shadow(color: .black.opacity(0.08), radius: 16, y: 8)
            }
            .padding(.horizontal, 20)
        }
    }

    private var trackingDots: some View {
        HStack(spacing: 7) {
            ForEach(orders.indices, id: \.self) { index in
                Capsule()
                    .fill(index == selectedIndex ? orders[index].status.color : DeliveraTheme.ink.opacity(0.14))
                    .frame(width: index == selectedIndex ? 24 : 7, height: 7)
            }
        }
        .frame(maxWidth: .infinity)
        .animation(.spring(response: 0.28, dampingFraction: 0.78), value: selectedIndex)
    }

    private var profileActions: some View {
        VStack(spacing: 10) {
            ProfileActionRow(symbol: "heart.fill", title: "Favoriter", subtitle: "Restauranger du sparat")
            ProfileActionRow(symbol: "gift.fill", title: "Rewards", subtitle: "Dpoints, deals och bonusar")
            ProfileActionRow(symbol: "gearshape.fill", title: "Inställningar", subtitle: "Adress, språk och betalning")
        }
        .padding(.horizontal, 20)
    }
}

private struct TrackingPage: View {
    let order: TrackingOrder
    let style: TrackingShowcaseStyle
    let onReceipt: () -> Void
    let onInfo: () -> Void
    let onContact: () -> Void
    @State private var appeared = false
    @State private var pulse = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            switch style {
            case .liveMap:
                TrackingMapFocus(order: order, pulse: pulse)
                compactStatus
            case .etaPanel:
                TrackingNoMapFocus(order: order, pulse: pulse)
                compactStatus
            case .cleanTimeline:
                TrackingCleanTimeline(order: order, pulse: pulse)
            case .courierCard:
                TrackingCourierCard(order: order, pulse: pulse)
            case .receiptFirst:
                TrackingReceiptFirstCard(order: order, pulse: pulse)
            }
            actionButtons
        }
        .padding(14)
        .background(.white.opacity(0.9), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(.white.opacity(0.9), lineWidth: 1))
        .shadow(color: order.status.color.opacity(0.16), radius: 26, y: 14)
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 14)
        .scaleEffect(appeared ? 1 : 0.985)
        .onAppear {
            withAnimation(.spring(response: 0.52, dampingFraction: 0.86)) {
                appeared = true
            }
            withAnimation(.easeInOut(duration: 1.7).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
    }

    private var compactStatus: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(order.status.title)
                        .font(.system(size: 18, weight: .black, design: .rounded))
                    Text(order.status.subtitle)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(DeliveraTheme.muted)
                        .lineLimit(1)
                }
                .foregroundStyle(DeliveraTheme.ink)
                Spacer()
                Text("\(Int(order.progress * 100))%")
                    .font(.system(size: 13, weight: .black))
                    .foregroundStyle(order.status.color)
            }

            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.black.opacity(0.06))
                    Capsule()
                        .fill(LinearGradient(colors: [DeliveraTheme.orange, order.status.color], startPoint: .leading, endPoint: .trailing))
                        .frame(width: max(12, proxy.size.width * order.progress))
                }
            }
            .frame(height: 8)

            HStack(spacing: 0) {
                ForEach(TrackingStatus.allCases) { status in
                    Circle()
                        .fill(order.status.rawValue >= status.rawValue ? status.color : Color.black.opacity(0.08))
                        .frame(width: order.status == status ? 13 : 9, height: order.status == status ? 13 : 9)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(14)
        .background(.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }

    private var actionButtons: some View {
        HStack(spacing: 8) {
            Button(action: onInfo) {
                Label("Orderinfo", systemImage: "list.bullet.rectangle.fill")
                    .font(.system(size: 12, weight: .black))
                    .foregroundStyle(DeliveraTheme.ink)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
            }
            .buttonStyle(.plain)

            Button(action: onReceipt) {
                Label("Kvitto", systemImage: "doc.text.fill")
                    .font(.system(size: 12, weight: .black))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(order.status.color, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)

            Button(action: onContact) {
                Label("Ring", systemImage: "phone.fill")
                    .font(.system(size: 12, weight: .black))
                    .foregroundStyle(DeliveraTheme.ink)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(DeliveraTheme.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(DeliveraTheme.orange.opacity(0.22), lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
    }
}

private enum TrackingShowcaseStyle: Int, CaseIterable {
    case liveMap
    case etaPanel
    case cleanTimeline
    case courierCard
    case receiptFirst
}

private struct TrackingMapFocus: View {
    let order: TrackingOrder
    let pulse: Bool

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let routeProgress = min(0.92, max(0.12, order.progress))

            ZStack {
                RoundedRectangle(cornerRadius: 30, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 0.91, green: 0.95, blue: 0.93),
                                Color(red: 0.99, green: 0.98, blue: 0.91),
                                Color(red: 0.96, green: 0.92, blue: 0.87)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                TimelineView(.animation) { timeline in
                    let time = timeline.date.timeIntervalSinceReferenceDate
                    Canvas { context, canvasSize in
                        drawMap(in: &context, size: canvasSize, time: time)
                    }
                }

                MapPin(symbol: "fork.knife", title: "Kök", color: DeliveraTheme.ink)
                    .position(x: size.width * 0.15, y: size.height * 0.74)

                MapPin(symbol: "house.fill", title: "Du", color: DeliveraTheme.orange)
                    .position(x: size.width * 0.84, y: size.height * 0.28)

                TimelineView(.animation) { timeline in
                    let time = timeline.date.timeIntervalSinceReferenceDate
                    let drift = order.status == .delivered ? 0 : CGFloat(sin(time * 1.25)) * 0.018
                    let position = routePoint(size: size, progress: min(0.95, max(0.08, routeProgress + drift)))

                    ZStack {
                        Circle()
                            .stroke(order.status.color.opacity(0.22), lineWidth: 12)
                            .frame(width: pulse ? 74 : 48, height: pulse ? 74 : 48)
                            .opacity(pulse ? 0 : 1)
                        Circle()
                            .fill(.white)
                            .frame(width: 54, height: 54)
                            .shadow(color: order.status.color.opacity(0.32), radius: 18, y: 10)
                        Image(systemName: order.status == .delivered ? "checkmark" : "scooter")
                            .font(.system(size: 23, weight: .black))
                            .foregroundStyle(order.status.color)
                    }
                    .position(position)
                }

                VStack {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(order.restaurantName)
                                .font(.system(size: 21, weight: .black, design: .rounded))
                                .foregroundStyle(DeliveraTheme.ink)
                                .lineLimit(1)
                            Text("\(order.orderNumber) · \(order.mode)")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(DeliveraTheme.muted)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 0) {
                            Text(order.countdownText)
                                .font(.system(size: 28, weight: .black, design: .rounded))
                                .foregroundStyle(order.status.color)
                            Text(order.status == .delivered ? "klart" : "kvar")
                                .font(.system(size: 10, weight: .black))
                                .foregroundStyle(DeliveraTheme.muted)
                        }
                    }

                    Spacer()

                    HStack {
                        Image(systemName: "location.fill")
                            .font(.system(size: 12, weight: .black))
                            .foregroundStyle(order.status.color)
                        Text(order.address)
                            .font(.system(size: 12, weight: .black))
                            .foregroundStyle(DeliveraTheme.ink)
                            .lineLimit(1)
                        Spacer()
                    }
                    .padding(.horizontal, 13)
                    .frame(height: 42)
                    .background(.white.opacity(0.9), in: Capsule())
                    .overlay(Capsule().stroke(.white, lineWidth: 1))
                }
                .padding(16)
            }
            .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).stroke(.white.opacity(0.86), lineWidth: 1))
        }
        .frame(height: 344)
    }

    private func drawMap(in context: inout GraphicsContext, size: CGSize, time: TimeInterval) {
        for x in stride(from: -size.width, through: size.width * 1.6, by: 54) {
            var street = Path()
            street.move(to: CGPoint(x: x, y: -30))
            street.addLine(to: CGPoint(x: x + size.height * 0.8, y: size.height + 30))
            context.stroke(street, with: .color(.white.opacity(0.52)), style: StrokeStyle(lineWidth: 10, lineCap: .round))
        }

        for y in stride(from: 38, through: size.height, by: 78) {
            var street = Path()
            street.move(to: CGPoint(x: -20, y: y + CGFloat(sin(time * 0.18 + Double(y))) * 3))
            street.addCurve(
                to: CGPoint(x: size.width + 20, y: y - 12),
                control1: CGPoint(x: size.width * 0.26, y: y - 24),
                control2: CGPoint(x: size.width * 0.68, y: y + 22)
            )
            context.stroke(street, with: .color(.white.opacity(0.42)), style: StrokeStyle(lineWidth: 7, lineCap: .round))
        }

        var route = Path()
        route.move(to: routePoint(size: size, progress: 0))
        route.addCurve(
            to: routePoint(size: size, progress: 1),
            control1: CGPoint(x: size.width * 0.32, y: size.height * 0.22),
            control2: CGPoint(x: size.width * 0.63, y: size.height * 0.78)
        )
        context.stroke(route, with: .color(order.status.color.opacity(0.16)), style: StrokeStyle(lineWidth: 24, lineCap: .round))
        context.stroke(route, with: .color(order.status.color.opacity(0.96)), style: StrokeStyle(lineWidth: 7, lineCap: .round))

        let dashPhase = CGFloat(time.truncatingRemainder(dividingBy: 1.0) * 18)
        context.stroke(route, with: .color(.white.opacity(0.72)), style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [8, 12], dashPhase: dashPhase))
    }

    private func routePoint(size: CGSize, progress: CGFloat) -> CGPoint {
        let t = min(1, max(0, progress))
        let start = CGPoint(x: size.width * 0.15, y: size.height * 0.74)
        let c1 = CGPoint(x: size.width * 0.32, y: size.height * 0.22)
        let c2 = CGPoint(x: size.width * 0.63, y: size.height * 0.78)
        let end = CGPoint(x: size.width * 0.84, y: size.height * 0.28)
        let mt = 1 - t
        return CGPoint(
            x: mt * mt * mt * start.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * end.x,
            y: mt * mt * mt * start.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * end.y
        )
    }
}

private struct TrackingNoMapFocus: View {
    let order: TrackingOrder
    let pulse: Bool

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [order.status.color, order.status.deepColor],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            TimelineView(.animation) { timeline in
                let t = timeline.date.timeIntervalSinceReferenceDate
                Canvas { context, size in
                    for index in 0..<5 {
                        let rect = CGRect(
                            x: CGFloat(index * 44) + CGFloat(cos(t * 0.22 + Double(index))) * 18,
                            y: CGFloat(index * 25) + CGFloat(sin(t * 0.18 + Double(index))) * 14,
                            width: CGFloat(116 + index * 30),
                            height: CGFloat(116 + index * 30)
                        )
                        context.fill(Path(ellipseIn: rect), with: .color(.white.opacity(index.isMultiple(of: 2) ? 0.08 : 0.045)))
                    }
                }
            }

            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(order.restaurantName)
                            .font(.system(size: 21, weight: .black, design: .rounded))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        Text("\(order.orderNumber) · \(order.mode)")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.white.opacity(0.68))
                    }
                    Spacer()
                    TrackingProgressRing(progress: order.progress, color: .white, background: .white.opacity(0.18)) {
                        Image(systemName: order.status.symbol)
                            .font(.system(size: 22, weight: .black))
                            .foregroundStyle(.white)
                            .scaleEffect(pulse && order.status != .delivered ? 1.06 : 1)
                    }
                }

                Spacer()

                VStack(alignment: .leading, spacing: 6) {
                    Text(order.countdownText)
                        .font(.system(size: 58, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                        .contentTransition(.numericText())
                    Text(order.status == .delivered ? "Ordern är levererad" : order.status.subtitle)
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(.white.opacity(0.78))
                        .lineLimit(2)
                }

                HStack(spacing: 8) {
                    ForEach(TrackingStatus.allCases) { status in
                        Capsule()
                            .fill(order.status.rawValue >= status.rawValue ? .white : .white.opacity(0.22))
                            .frame(height: 7)
                            .frame(maxWidth: .infinity)
                    }
                }

                HStack(spacing: 8) {
                    Image(systemName: "mappin.and.ellipse")
                        .font(.system(size: 12, weight: .black))
                    Text(order.address)
                        .lineLimit(1)
                    Spacer()
                }
                .font(.system(size: 12, weight: .black))
                .foregroundStyle(.white.opacity(0.84))
                .padding(.horizontal, 12)
                .frame(height: 38)
                .background(.white.opacity(0.14), in: Capsule())
            }
            .padding(22)
        }
        .frame(height: 344)
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).stroke(.white.opacity(0.18), lineWidth: 1))
    }
}

private struct TrackingCleanTimeline: View {
    let order: TrackingOrder
    let pulse: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(order.status.title)
                        .font(.system(size: 34, weight: .black, design: .rounded))
                        .foregroundStyle(DeliveraTheme.ink)
                    Text(order.restaurantName)
                        .font(.system(size: 14, weight: .black))
                        .foregroundStyle(DeliveraTheme.muted)
                        .lineLimit(1)
                }
                Spacer()
                Text(order.countdownText)
                    .font(.system(size: 27, weight: .black, design: .rounded))
                    .foregroundStyle(order.status.color)
                    .padding(.horizontal, 14)
                    .frame(height: 44)
                    .background(order.status.color.opacity(0.12), in: Capsule())
            }

            VStack(spacing: 0) {
                ForEach(TrackingStatus.allCases) { status in
                    HStack(spacing: 12) {
                        ZStack {
                            Circle()
                                .fill(order.status.rawValue >= status.rawValue ? status.color : Color.black.opacity(0.06))
                                .frame(width: order.status == status ? 32 : 24, height: order.status == status ? 32 : 24)
                            Image(systemName: status.symbol)
                                .font(.system(size: 10, weight: .black))
                                .foregroundStyle(order.status.rawValue >= status.rawValue ? .white : DeliveraTheme.muted)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(status.title)
                                .font(.system(size: 14, weight: .black))
                                .foregroundStyle(DeliveraTheme.ink)
                            Text(status.subtitle)
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(DeliveraTheme.muted)
                                .lineLimit(1)
                        }
                        Spacer()
                    }
                    .padding(.vertical, 8)
                }
            }

            HStack(spacing: 8) {
                Image(systemName: "mappin.and.ellipse")
                    .foregroundStyle(order.status.color)
                Text(order.address)
                    .lineLimit(1)
                Spacer()
            }
            .font(.system(size: 12, weight: .black))
            .foregroundStyle(DeliveraTheme.ink)
            .padding(.horizontal, 13)
            .frame(height: 40)
            .background(.white, in: Capsule())
            .overlay(Capsule().stroke(DeliveraTheme.line, lineWidth: 1))
        }
        .padding(20)
        .frame(height: 430, alignment: .top)
        .background(.white, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }
}

private struct TrackingCourierCard: View {
    let order: TrackingOrder
    let pulse: Bool

    var body: some View {
        ZStack(alignment: .leading) {
            LinearGradient(
                colors: [Color(red: 0.08, green: 0.09, blue: 0.10), order.status.deepColor],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            TimelineView(.animation) { timeline in
                let t = timeline.date.timeIntervalSinceReferenceDate
                ForEach(0..<4, id: \.self) { index in
                    Circle()
                        .stroke(.white.opacity(0.07), lineWidth: 1)
                        .frame(width: CGFloat(120 + index * 58), height: CGFloat(120 + index * 58))
                        .offset(x: CGFloat(170 + index * 18), y: CGFloat(-10 + sin(t * 0.35 + Double(index)) * 14))
                }
            }

            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(order.courierName)
                            .font(.system(size: 32, weight: .black, design: .rounded))
                            .foregroundStyle(.white)
                        Text(order.status == .onTheWay ? "är på väg till dig" : order.status.subtitle)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(.white.opacity(0.7))
                    }
                    Spacer()
                    Image(systemName: order.status == .delivered ? "checkmark" : "scooter")
                        .font(.system(size: 31, weight: .black))
                        .foregroundStyle(order.status.color)
                        .frame(width: 70, height: 70)
                        .background(.white, in: Circle())
                        .scaleEffect(pulse && order.status != .delivered ? 1.05 : 1)
                }

                Spacer()

                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(order.restaurantName)
                            .font(.system(size: 16, weight: .black))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        Text(order.address)
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.white.opacity(0.64))
                            .lineLimit(1)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(order.countdownText)
                            .font(.system(size: 44, weight: .black, design: .rounded))
                            .foregroundStyle(.white)
                        Text("ETA")
                            .font(.system(size: 11, weight: .black))
                            .foregroundStyle(.white.opacity(0.58))
                    }
                }

                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule().fill(.white.opacity(0.16))
                        Capsule().fill(order.status.color).frame(width: max(18, proxy.size.width * order.progress))
                    }
                }
                .frame(height: 8)
            }
            .padding(22)
        }
        .frame(height: 430)
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
    }
}

private struct TrackingReceiptFirstCard: View {
    let order: TrackingOrder
    let pulse: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(order.status == .delivered ? "Dags för review" : "Orderöversikt")
                        .font(.system(size: 28, weight: .black, design: .rounded))
                        .foregroundStyle(DeliveraTheme.ink)
                    Text(order.orderNumber)
                        .font(.system(size: 12, weight: .black))
                        .foregroundStyle(DeliveraTheme.muted)
                }
                Spacer()
                DpointsGlyph(size: 42)
                    .scaleEffect(pulse ? 1.05 : 0.96)
                    .shadow(color: DeliveraTheme.orange.opacity(0.24), radius: 18, y: 8)
            }

            VStack(spacing: 10) {
                ReceiptPreviewLine(title: "Restaurang", value: order.restaurantName)
                ReceiptPreviewLine(title: "Status", value: order.status.title)
                ReceiptPreviewLine(title: "ETA", value: order.countdownText)
                ReceiptPreviewLine(title: "Totalt", value: priceText(order.total), prominent: true)
            }
            .padding(15)
            .background(Color.black.opacity(0.035), in: RoundedRectangle(cornerRadius: 20, style: .continuous))

            if order.status == .delivered {
                HStack(spacing: 10) {
                    Image(systemName: "star.fill")
                        .foregroundStyle(DeliveraTheme.gold)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Recensera och få Dpoints")
                            .font(.system(size: 14, weight: .black))
                        Text("Visas bara en gång per slutförd order.")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(DeliveraTheme.muted)
                    }
                    Spacer()
                }
                .padding(14)
                .background(DeliveraTheme.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            } else {
                TrackingMiniMap(order: order, pulse: pulse)
            }
        }
        .padding(20)
        .frame(height: 430, alignment: .top)
        .background(.white, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }
}

private struct TrackingMiniMap: View {
    let order: TrackingOrder
    let pulse: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: order.status.symbol)
                .font(.system(size: 16, weight: .black))
                .foregroundStyle(.white)
                .frame(width: 42, height: 42)
                .background(order.status.color, in: Circle())
                .scaleEffect(pulse ? 1.04 : 1)
            VStack(alignment: .leading, spacing: 2) {
                Text(order.status.subtitle)
                    .font(.system(size: 13, weight: .black))
                    .foregroundStyle(DeliveraTheme.ink)
                    .lineLimit(1)
                Text(order.address)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(DeliveraTheme.muted)
                    .lineLimit(1)
            }
            Spacer()
        }
        .padding(14)
        .background(order.status.color.opacity(0.08), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct ReceiptPreviewLine: View {
    let title: String
    let value: String
    var prominent = false

    var body: some View {
        HStack {
            Text(title)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(DeliveraTheme.muted)
            Spacer()
            Text(value)
                .font(.system(size: prominent ? 17 : 13, weight: .black))
                .foregroundStyle(prominent ? DeliveraTheme.ink : DeliveraTheme.ink.opacity(0.82))
                .lineLimit(1)
        }
    }
}

private struct TrackingProgressRing<Content: View>: View {
    let progress: CGFloat
    let color: Color
    let background: Color
    let content: Content

    init(progress: CGFloat, color: Color, background: Color, @ViewBuilder content: () -> Content) {
        self.progress = progress
        self.color = color
        self.background = background
        self.content = content()
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(background, lineWidth: 8)
            Circle()
                .trim(from: 0, to: min(1, max(0, progress)))
                .stroke(color, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                .rotationEffect(.degrees(-90))
            content
        }
        .frame(width: 72, height: 72)
    }
}

private struct TrackingMapCard: View {
    let order: TrackingOrder

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            Color(red: 0.94, green: 0.96, blue: 0.94),
                            Color(red: 0.99, green: 0.98, blue: 0.94)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            Canvas { context, size in
                let roads = [
                    Path { path in
                        path.move(to: CGPoint(x: -20, y: size.height * 0.34))
                        path.addCurve(
                            to: CGPoint(x: size.width + 28, y: size.height * 0.26),
                            control1: CGPoint(x: size.width * 0.22, y: size.height * 0.12),
                            control2: CGPoint(x: size.width * 0.72, y: size.height * 0.54)
                        )
                    },
                    Path { path in
                        path.move(to: CGPoint(x: size.width * 0.18, y: -18))
                        path.addCurve(
                            to: CGPoint(x: size.width * 0.82, y: size.height + 18),
                            control1: CGPoint(x: size.width * 0.42, y: size.height * 0.22),
                            control2: CGPoint(x: size.width * 0.44, y: size.height * 0.78)
                        )
                    }
                ]
                for road in roads {
                    context.stroke(road, with: .color(.white.opacity(0.8)), style: StrokeStyle(lineWidth: 12, lineCap: .round))
                    context.stroke(road, with: .color(.black.opacity(0.04)), style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
                }

                var route = Path()
                route.move(to: CGPoint(x: size.width * 0.17, y: size.height * 0.72))
                route.addCurve(
                    to: CGPoint(x: size.width * 0.82, y: size.height * 0.26),
                    control1: CGPoint(x: size.width * 0.36, y: size.height * 0.46),
                    control2: CGPoint(x: size.width * 0.58, y: size.height * 0.66)
                )
                context.stroke(route, with: .color(order.status.color.opacity(0.22)), style: StrokeStyle(lineWidth: 15, lineCap: .round))
                context.stroke(route, with: .color(order.status.color), style: StrokeStyle(lineWidth: 5, lineCap: .round, dash: [9, 7]))
            }
            .padding(6)

            VStack {
                HStack {
                    MapPin(symbol: "fork.knife", title: "Kök", color: DeliveraTheme.ink)
                    Spacer()
                    MapPin(symbol: order.status == .delivered ? "checkmark" : "scooter", title: order.courierName, color: order.status.color)
                }
                Spacer()
                HStack {
                    Spacer()
                    MapPin(symbol: "house.fill", title: "Du", color: DeliveraTheme.orange)
                }
            }
            .padding(13)
        }
        .frame(height: 148)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }
}

private struct MapPin: View {
    let symbol: String
    let title: String
    let color: Color

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .black))
                .foregroundStyle(.white)
                .frame(width: 24, height: 24)
                .background(color, in: Circle())
            Text(title)
                .font(.system(size: 10, weight: .black))
                .foregroundStyle(DeliveraTheme.ink)
                .lineLimit(1)
        }
        .padding(.horizontal, 8)
        .frame(height: 34)
        .background(.white.opacity(0.9), in: Capsule())
        .shadow(color: .black.opacity(0.08), radius: 10, y: 5)
    }
}

private struct ProfileActionRow: View {
    let symbol: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .black))
                .foregroundStyle(DeliveraTheme.orange)
                .frame(width: 42, height: 42)
                .background(DeliveraTheme.orange.opacity(0.11), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: .black))
                    .foregroundStyle(DeliveraTheme.ink)
                Text(subtitle)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(DeliveraTheme.muted)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .black))
                .foregroundStyle(DeliveraTheme.muted)
        }
        .padding(14)
        .background(.white.opacity(0.84), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }
}

private struct OrderInfoView: View {
    let order: TrackingOrder

    var body: some View {
        ZStack {
            DeliveraTheme.appBackground.ignoresSafeArea()
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    SheetHeader(title: "Orderinfo", subtitle: order.orderNumber, symbol: "list.bullet.rectangle.fill", color: order.status.color)
                    InfoBlock(title: "Restaurang", rows: [
                        ("Namn", order.restaurantName),
                        ("Status", order.status.title),
                        ("Kurir", order.courierName)
                    ])
                    InfoBlock(title: "Leverans", rows: [
                        ("Adress", order.address),
                        ("ETA", order.countdownText),
                        ("Typ", order.mode)
                    ])
                    InfoBlock(title: "Artiklar", rows: order.items.map { ($0.name, "\($0.quantity)x - \(priceText($0.total))") })
                }
                .padding(20)
            }
        }
    }
}

private struct ReceiptView: View {
    let order: TrackingOrder

    var body: some View {
        ZStack {
            DeliveraTheme.appBackground.ignoresSafeArea()
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    SheetHeader(title: "Kvitto", subtitle: order.orderNumber, symbol: "doc.text.fill", color: order.status.color)

                    VStack(spacing: 12) {
                        ForEach(order.items) { item in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.name)
                                        .font(.system(size: 15, weight: .black))
                                    Text("\(item.quantity)x")
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundStyle(DeliveraTheme.muted)
                                }
                                Spacer()
                                Text(priceText(item.total))
                                    .font(.system(size: 14, weight: .black))
                            }
                            .foregroundStyle(DeliveraTheme.ink)
                        }
                        Divider()
                        ReceiptTotalLine(title: "Subtotal", value: priceText(order.subtotal))
                        ReceiptTotalLine(title: "Leverans", value: priceText(order.deliveryFee))
                        ReceiptTotalLine(title: "Rabatt", value: order.discount > 0 ? "-\(priceText(order.discount))" : "0 kr")
                        ReceiptTotalLine(title: "Totalt", value: priceText(order.total), prominent: true)
                    }
                    .padding(16)
                    .background(.white, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
                }
                .padding(20)
            }
        }
    }
}

private struct SheetHeader: View {
    let title: String
    let subtitle: String
    let symbol: String
    let color: Color

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 20, weight: .black))
                .foregroundStyle(.white)
                .frame(width: 50, height: 50)
                .background(color, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 28, weight: .black, design: .rounded))
                    .foregroundStyle(DeliveraTheme.ink)
                Text(subtitle)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(DeliveraTheme.muted)
            }
        }
    }
}

private struct InfoBlock: View {
    let title: String
    let rows: [(String, String)]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.system(size: 18, weight: .black, design: .rounded))
                .foregroundStyle(DeliveraTheme.ink)
            ForEach(rows, id: \.0) { row in
                HStack(alignment: .top) {
                    Text(row.0)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(DeliveraTheme.muted)
                    Spacer()
                    Text(row.1)
                        .font(.system(size: 13, weight: .black))
                        .foregroundStyle(DeliveraTheme.ink)
                        .multilineTextAlignment(.trailing)
                }
            }
        }
        .padding(16)
        .background(.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(DeliveraTheme.line, lineWidth: 1))
    }
}

private struct ReceiptTotalLine: View {
    let title: String
    let value: String
    var prominent = false

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            Text(value)
        }
        .font(.system(size: prominent ? 18 : 13, weight: prominent ? .black : .bold))
        .foregroundStyle(prominent ? DeliveraTheme.ink : DeliveraTheme.muted)
    }
}

private struct TrackingOrder: Identifiable {
    let id: String
    let orderNumber: String
    let restaurantName: String
    let status: TrackingStatus
    let minutesRemaining: Int
    let courierName: String
    let address: String
    let mode: String
    let deliveryFee: Double
    let discount: Double
    let items: [TrackingItem]

    var subtotal: Double { items.reduce(0) { $0 + $1.total } }
    var total: Double { max(0, subtotal + deliveryFee - discount) }
    var progress: CGFloat { status.progress }
    var countdownText: String {
        status == .delivered ? "0 min" : "\(minutesRemaining) min"
    }

    static let samples: [TrackingOrder] = [
        TrackingOrder(
            id: "swift-demo-1",
            orderNumber: "#DL-1048",
            restaurantName: "Palmyra Pizzeria",
            status: .confirmed,
            minutesRemaining: 31,
            courierName: "Sara",
            address: "Stortorget 4, Malmö",
            mode: "Leverans",
            deliveryFee: 39,
            discount: 0,
            items: [
                TrackingItem(name: "2 Pizza Combo", quantity: 1, total: 199),
                TrackingItem(name: "Coca-Cola", quantity: 2, total: 36)
            ]
        ),
        TrackingOrder(
            id: "swift-demo-2",
            orderNumber: "#DL-1049",
            restaurantName: "Malmö Bowls",
            status: .preparing,
            minutesRemaining: 22,
            courierName: "Nora",
            address: "Södra Förstadsgatan 18, Malmö",
            mode: "Leverans",
            deliveryFee: 29,
            discount: 20,
            items: [
                TrackingItem(name: "Chicken Bowl", quantity: 1, total: 129),
                TrackingItem(name: "Mango Lassi", quantity: 1, total: 45)
            ]
        ),
        TrackingOrder(
            id: "swift-demo-3",
            orderNumber: "#DL-1050",
            restaurantName: "Nordic Burger",
            status: .pickupReady,
            minutesRemaining: 14,
            courierName: "Alex",
            address: "Triangeln, Malmö",
            mode: "Avhämtning",
            deliveryFee: 0,
            discount: 0,
            items: [
                TrackingItem(name: "Smash Burger", quantity: 1, total: 119),
                TrackingItem(name: "Fries", quantity: 1, total: 39)
            ]
        ),
        TrackingOrder(
            id: "swift-demo-4",
            orderNumber: "#DL-1051",
            restaurantName: "Sushi Nara",
            status: .onTheWay,
            minutesRemaining: 7,
            courierName: "Yasin",
            address: "Davidshallsgatan 12, Malmö",
            mode: "Leverans",
            deliveryFee: 49,
            discount: 15,
            items: [
                TrackingItem(name: "Salmon Set", quantity: 1, total: 159),
                TrackingItem(name: "Edamame", quantity: 1, total: 49)
            ]
        ),
        TrackingOrder(
            id: "swift-demo-5",
            orderNumber: "#DL-1052",
            restaurantName: "Crispy Corner",
            status: .delivered,
            minutesRemaining: 0,
            courierName: "Maja",
            address: "Amiralsgatan 7, Malmö",
            mode: "Leverans",
            deliveryFee: 0,
            discount: 25,
            items: [
                TrackingItem(name: "Crispy tallrik", quantity: 1, total: 139),
                TrackingItem(name: "Dip", quantity: 2, total: 20)
            ]
        )
    ]
}

private struct TrackingItem: Identifiable {
    let id = UUID()
    let name: String
    let quantity: Int
    let total: Double
}

private enum TrackingStatus: Int, CaseIterable, Identifiable {
    case confirmed = 0
    case preparing = 1
    case pickupReady = 2
    case onTheWay = 3
    case delivered = 4

    var id: Int { rawValue }
    var title: String {
        switch self {
        case .confirmed: return "Bekräftad"
        case .preparing: return "Tillagas"
        case .pickupReady: return "Redo"
        case .onTheWay: return "På väg"
        case .delivered: return "Levererad"
        }
    }
    var shortTitle: String {
        switch self {
        case .confirmed: return "OK"
        case .preparing: return "Kök"
        case .pickupReady: return "Redo"
        case .onTheWay: return "Väg"
        case .delivered: return "Klar"
        }
    }
    var subtitle: String {
        switch self {
        case .confirmed: return "Restaurangen har tagit emot ordern"
        case .preparing: return "Köket jobbar på din mat"
        case .pickupReady: return "Snart lämnar maten restaurangen"
        case .onTheWay: return "Kuriren är nära dig"
        case .delivered: return "Ordern är avslutad"
        }
    }
    var symbol: String {
        switch self {
        case .confirmed: return "checkmark.seal.fill"
        case .preparing: return "flame.fill"
        case .pickupReady: return "bag.fill"
        case .onTheWay: return "scooter"
        case .delivered: return "house.fill"
        }
    }
    var color: Color {
        switch self {
        case .confirmed: return Color(red: 0.94, green: 0.31, blue: 0.10)
        case .preparing: return Color(red: 0.88, green: 0.19, blue: 0.24)
        case .pickupReady: return Color(red: 0.88, green: 0.55, blue: 0.09)
        case .onTheWay: return Color(red: 0.12, green: 0.46, blue: 0.78)
        case .delivered: return Color(red: 0.13, green: 0.55, blue: 0.34)
        }
    }
    var deepColor: Color {
        switch self {
        case .confirmed: return Color(red: 0.12, green: 0.10, blue: 0.09)
        case .preparing: return Color(red: 0.23, green: 0.06, blue: 0.09)
        case .pickupReady: return Color(red: 0.18, green: 0.13, blue: 0.05)
        case .onTheWay: return Color(red: 0.04, green: 0.10, blue: 0.20)
        case .delivered: return Color(red: 0.04, green: 0.16, blue: 0.10)
        }
    }
    var progress: CGFloat {
        switch self {
        case .confirmed: return 0.18
        case .preparing: return 0.42
        case .pickupReady: return 0.62
        case .onTheWay: return 0.82
        case .delivered: return 1
        }
    }
}
