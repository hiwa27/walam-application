import 'package:flutter/widgets.dart';
import 'package:flutter/services.dart';
import 'package:walam_mobile_app/app/app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations(const [
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);
  runApp(const WalamApp());
}
