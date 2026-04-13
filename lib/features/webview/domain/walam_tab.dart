import 'package:flutter/material.dart';
import 'package:walam_mobile_app/core/constants/app_urls.dart';

enum WalamTab { home, search, profile }

extension WalamTabX on WalamTab {
  String get label => switch (this) {
    WalamTab.home => 'سەرەکی',
    WalamTab.search => 'دەستپێکردن',
    WalamTab.profile => 'فێرکاری',
  };

  IconData get icon => switch (this) {
    WalamTab.home => Icons.home_rounded,
    WalamTab.search => Icons.login_rounded,
    WalamTab.profile => Icons.play_lesson_rounded,
  };

  Uri get url => switch (this) {
    WalamTab.home => AppUrls.home,
    WalamTab.search => AppUrls.start,
    WalamTab.profile => AppUrls.tutorial,
  };
}
