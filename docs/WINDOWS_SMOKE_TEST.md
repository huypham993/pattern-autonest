# Smoke test trên Windows + Illustrator thật

Mục đích: xác nhận trên máy thật những gì môi trường Linux không thể kiểm chứng (API Illustrator, hệ tọa độ,
ghi file, đường dẫn Unicode, OneDrive...). Không cần sửa code. Mọi bước đều tạo file báo cáo để gửi lại.

## 0. Chuẩn bị (một lần)

1. Giải nén `illustrator-autonesting-v0.3.1.zip`, ví dụ vào `C:\Tools\illustrator-autonesting`.
2. Cài Python 3.10+ từ python.org (tick *Add python.exe to PATH*).
3. Double-click `tools\windows\setup_autonest.cmd`. Script cài engine vào `engine\.venv`, rồi tự chạy
   `analyze` và `nest` trên file mẫu. Phải thấy dòng `Cai dat xong.`

Chỉ dùng hai file JSX trong thư mục `dist\`:

| File | Dùng để |
|---|---|
| `dist\AutoNesting_SmokeTest_Standalone.jsx` | Smoke test tự động (Phần A) |
| `dist\Illustrator_AutoNesting_Standalone.jsx` | Export geometry từ artwork thật (Phần B) |

Không chạy các file trong `jsx\`: chúng là source cho nhà phát triển, cần thư mục `jsx\lib` bên cạnh
và sẽ báo Error 48 nếu bị tách riêng.

## Phần A: smoke test tự động (khoảng 2 phút)

1. Mở Adobe Illustrator 2025 hoặc 2026.
2. `File > Scripts > Other Script...` → chọn `dist\AutoNesting_SmokeTest_Standalone.jsx`.
   Script tự tạo một document mới 600 × 400 mm (CMYK) và vẽ 5 Group đã biết trước kích thước:
   chữ L, chữ U, L có đảo rời, hình có clipping mask tròn, vòng tròn có lỗ.
   Các document khác không bị đụng tới.
3. Script chạy 16 kiểm tra (C01–C16) bằng chính code export thật, rồi hiện hộp thoại `PASS x / FAIL y`
   và đường dẫn báo cáo.
4. Kết quả nằm trong `Documents\AutoNesting_SmokeTest\` (với OneDrive có thể là
   `OneDrive\Documents\AutoNesting_SmokeTest\`):
   * `smoke_report.txt`: từng kiểm tra PASS/FAIL kèm số đo, phiên bản Illustrator/ExtendScript, hệ điều hành, locale;
   * `geometry.json`: dữ liệu export thật của 5 Group;
   * `smoke_expected.json`: kích thước/diện tích đúng của 5 Group.
5. Double-click `tools\windows\autonest_smoke_check.cmd` (hoặc kéo thư mục `AutoNesting_SmokeTest` thả vào file này).
   Engine Python phân tích `geometry.json` thật và đối chiếu với `smoke_expected.json`:
   * S01–S04: đủ 5 Group, không lệch hệ tọa độ, bounds lệch ≤ 0.01 mm (hình cong ≤ dung sai cong),
     diện tích lệch ≤ 0.01 % (hình cong ≤ 2 %);
   * S05–S06: chạy `nest` trên dữ liệu thật và kiểm tra độc lập (không va chạm, đủ spacing, trong artboard).
   Kết quả ghi vào `smoke_check_report.txt`, `analysis.svg`, `placement.json`, `placement.svg`.
6. Mở `analysis.svg` và `placement.svg` bằng trình duyệt, đặt cạnh artboard trong Illustrator để so hình.
7. Đóng document smoke test (không cần lưu).

Ý nghĩa một số kiểm tra trong `smoke_report.txt`:

| Mã | Kiểm tra | Nếu FAIL |
|---|---|---|
| C02 | trục y hướng lên trong DOCUMENTCOORDINATESYSTEM | hệ tọa độ khác giả định, cần sửa engine |
| C05 | `app.coordinateSystem` được trả lại như cũ | script làm thay đổi thiết lập người dùng |
| C06.x | bounds từng Group đúng tới 0.01 mm | lệch hệ tọa độ hoặc đơn vị |
| C08 | bounds của clip group = bounds của clipping path hoặc của nội dung bị clip (Illustrator 30.7 dùng nội dung) | Illustrator báo bounds theo quy ước thứ ba, cần sửa engine |
| C09 | `uuid` và `getPageItemFromUuid` | Phase 4 sẽ tìm Group bằng tên + chỉ số thay vì uuid |
| C12 | ghi file vào thư mục tên tiếng Việt có dấu | lỗi mã hóa đường dẫn |
| C13 | tốc độ đọc path 5000 điểm (dòng báo cáo ghi path được dựng bằng `setEntirePath` hay `pathPoints.add`) | chỉ để tham khảo hiệu năng |
| C14 | chiều quay và tâm quay của `rotate(90)` | Phase 4 Apply phải bù tâm quay |
| C15–C16 | `translate` chính xác và hoàn tác được | Phase 4 Apply không an toàn |

## Phần B: export artwork thật (3–5 Group chữ L và U)

1. Tạo document thử, vẽ 3–5 hình chữ L và U, mỗi hình **Group** riêng (`Ctrl+G`).
2. Chọn các Group đó, đặt artboard đích làm artboard đang active.
3. `File > Scripts > Other Script...` → `dist\Illustrator_AutoNesting_Standalone.jsx`.
   Script **chỉ đọc**, không thay đổi document. Hộp thoại cho biết số Group, số điểm và đường dẫn `geometry.json`
   (cạnh file .ai trong thư mục `<tên file>_autonest\`, hoặc `Documents\AutoNesting\` nếu document chưa lưu).
4. Kiểm tra nhanh trong hộp thoại: số Group đúng với số đã chọn; nếu có đối tượng không phải Group bị chọn,
   số đó được báo là "skipped".
5. Kéo `geometry.json` thả vào `tools\windows\autonest_analyze.cmd` → `analysis.json` + `analysis.svg`.
   Mở `analysis.svg`: các hình phải trùng vị trí và hình dạng với artboard (xanh = ok, cam = cảnh báo, đỏ = lỗi).
6. Kéo `geometry.json` thả vào `tools\windows\autonest_nest.cmd` → `placement.json` + `placement.svg`.
   Thông báo cuối cho biết đã xếp hết, xếp một phần, hay kiểm tra thất bại. Phase 3A **chưa** áp vị trí vào
   Illustrator (Apply là Phase 4); `placement.svg` là bản xem trước tính từ geometry thật + ma trận biến đổi.

## Khi có lỗi

* Lỗi khi chạy JSX: hộp thoại ghi **bước bị lỗi** (ví dụ `write-geometry`), thông báo lỗi, số dòng, tên file,
  và đường dẫn `autonest_diagnostics.txt`. File này chứa: phiên bản build (`AN_BUILD_INFO`), đường dẫn script đang
  chạy, phiên bản Illustrator/ExtendScript, hệ điều hành, locale, từng bước đã chạy, exception đầy đủ
  (name, message, number, line, file, dòng code).
* Lỗi khi chạy `.cmd`: chép toàn bộ nội dung cửa sổ console.
* Gửi lại: `smoke_report.txt`, `smoke_check_report.txt`, `autonest_diagnostics.txt` (nếu có), `geometry.json`,
  và ảnh chụp artboard nếu hình trong SVG không khớp.

Nếu Illustrator báo `Error 48: File or folder does not exist` với dòng `//@include`, nghĩa là file đang chạy là
source trong `jsx\`, không phải file trong `dist\`. File `dist\*.jsx` không có `//@include` nào (build kiểm tra điều này).
