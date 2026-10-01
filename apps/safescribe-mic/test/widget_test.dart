import 'package:flutter_test/flutter_test.dart';
import 'package:safescribe_mic/main.dart';

void main() {
  testWidgets('SafeScribe Mic shows branding', (tester) async {
    await tester.pumpWidget(const SafeScribeMicApp());
    expect(find.text('SafeScribe Mic'), findsOneWidget);
    expect(find.textContaining('QR code'), findsOneWidget);
  });
}
