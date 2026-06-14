import 'package:delivera_courier/widgets/courier_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Regressionstester för SwipeToConfirm — den som var "glitchad" och kunde
/// dubbel-avfyra. Verifierar att en full svep avfyrar exakt EN gång, att en
/// partiell svep inte avfyrar, och att en inaktiverad svep inte avfyrar.
Widget _host(Widget child) => MaterialApp(
      home: Scaffold(
        body: Center(child: SizedBox(width: 300, child: child)),
      ),
    );

void main() {
  testWidgets('full svep avfyrar onConfirm exakt en gång', (tester) async {
    var count = 0;
    await tester.pumpWidget(_host(SwipeToConfirm(
      label: 'Svep',
      onConfirm: () async => count++,
    )));

    // Dra hela vägen till höger → över tröskeln.
    await tester.drag(find.byType(SwipeToConfirm), const Offset(320, 0));
    await tester.pumpAndSettle();

    expect(count, 1);
  });

  testWidgets('partiell svep avfyrar inte (snäpper tillbaka)', (tester) async {
    var count = 0;
    await tester.pumpWidget(_host(SwipeToConfirm(
      label: 'Svep',
      onConfirm: () async => count++,
    )));

    // Liten dragning, långt under 0.85-tröskeln.
    await tester.drag(find.byType(SwipeToConfirm), const Offset(40, 0));
    await tester.pumpAndSettle();

    expect(count, 0);
  });

  testWidgets('inaktiverad svep avfyrar inte', (tester) async {
    var count = 0;
    await tester.pumpWidget(_host(SwipeToConfirm(
      label: 'Svep',
      enabled: false,
      onConfirm: () async => count++,
    )));

    await tester.drag(find.byType(SwipeToConfirm), const Offset(320, 0));
    await tester.pumpAndSettle();

    expect(count, 0);
  });

  testWidgets('en svep avfyrar inte två gånger även vid snabb upprepning',
      (tester) async {
    var count = 0;
    await tester.pumpWidget(_host(SwipeToConfirm(
      label: 'Svep',
      onConfirm: () async => count++,
    )));

    await tester.drag(find.byType(SwipeToConfirm), const Offset(320, 0));
    await tester.pump(); // mitt i återställnings-animationen
    // Försök svepa igen direkt — ska ignoreras tills tummen är hemma.
    await tester.drag(find.byType(SwipeToConfirm), const Offset(320, 0));
    await tester.pumpAndSettle();

    expect(count, 1);
  });
}
