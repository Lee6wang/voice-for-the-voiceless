"""Day 0 验证脚本：一次性验证「无声之声」需要的全部戒指输入能力。

验证项：
1. BLE 连接 + 系统信息（电量 >20% 才能正常工作）
2. 模式确认：引导用户单击切换到手势模式（start_sensor_report 成功即确认）
3. IMU 原始数据流（25Hz）+ 左/右倾斜检测（候选导航用）
4. 双击事件 0x0701（确认键）
5. HMM 手势 0x0702（wave = 换一批）
6. 按键双击 0x0703（紧急呼救）

用法：
    python -m pip install bleak
    python ring_day0_test.py --address <戒指MAC地址>
    # 不知道 MAC 时先扫描：
    python ring_day0_test.py --scan
"""

import argparse
import asyncio
import sys

import ring_sound as sdk

# 倾斜检测参数：accel 原始值为 i16，量程以 SensorStartInfo.accel_range_g 为准
TILT_THRESHOLD_G = 0.45   # 判定为倾斜的重力分量阈值
TILT_COOLDOWN_S = 0.6     # 两次导航之间的冷却，防止连续触发


async def scan() -> None:
    print("扫描 BLE 设备中（5 秒）...")
    devices = await sdk.scan_rings(timeout_s=5.0)
    if not devices:
        print("未发现设备。请确认戒指在广播且未被其他程序连接。")
        return
    for d in devices:
        print(f"  {d.address}  rssi={d.rssi}  name={d.name or '-'}")


async def ensure_gesture_mode(ring: sdk.RingSoundClient) -> sdk.SensorStartInfo:
    """反复引导用户单击按键，直到 start_sensor_report 成功（= 已在手势模式）。"""
    while True:
        try:
            start = await sdk.start_sensor_report(ring)
            print(f"[OK] 已在手势模式，IMU 上报开启：{start.sample_rate_hz}Hz, "
                  f"accel ±{start.accel_range_g}g, gyro ±{start.gyro_range_dps}dps")
            return start
        except sdk.DeviceError as exc:
            if exc.error_code == 2:
                print(">> 设备在录音模式。请【单击】戒指按键切换到手势模式...")
                try:
                    await sdk.wait_sensor_key_single_press_event(ring, timeout_s=30.0)
                except sdk.TimeoutError:
                    print("!! 30 秒未检测到单击，继续等待")
                await asyncio.sleep(0.5)  # 等模式切换完成
            else:
                raise


async def main(address: str) -> None:
    async with sdk.RingSoundClient(address=address) as ring:
        sdk.enable_time_sync(ring)

        info = await sdk.get_system_info(ring)
        print(f"[OK] 连接成功：固件 {info.firmware_version}，电量 {info.battery_percent}%"
              f"{'（充电中）' if info.battery_charging else ''}")
        if info.battery_percent < 20:
            print("!! 电量低于 20%，设备会拒绝录音/手势操作，请先充电")

        # ---- 事件回调：双击 / HMM 手势 / 按键双击 / 按键单击 ----
        def on_double_tap(packet: sdk.Packet) -> None:
            event = sdk.parse_sensor_double_tap_event(packet.body)
            print(f"\n✅ [确认键] IMU 双击  ts={event.timestamp_ms}")

        def on_gesture(packet: sdk.Packet) -> None:
            event = sdk.parse_sensor_gesture_event(packet.body)
            name = sdk.sensor_gesture_name(event.gesture_id)
            print(f"\n🔄 [HMM 手势] {name}  ts={event.timestamp_ms}"
                  + ("  → 换一批候选" if name == "wave" else ""))

        def on_key_double(packet: sdk.Packet) -> None:
            event = sdk.parse_sensor_key_double_press_event(packet.body)
            print(f"\n🚨 [紧急呼救] 按键双击  ts={event.timestamp_ms}")

        def on_key_single(packet: sdk.Packet) -> None:
            event = sdk.parse_sensor_key_single_press_event(packet.body)
            print(f"\n⛔ [警告] 按键单击 ts={event.timestamp_ms} —— 设备可能已切回录音模式！")

        ring.add_packet_handler(0x0701, on_double_tap)
        ring.add_packet_handler(0x0702, on_gesture)
        ring.add_packet_handler(0x0703, on_key_double)
        ring.add_packet_handler(0x0704, on_key_single)

        start = await ensure_gesture_mode(ring)
        accel_scale = start.accel_range_g / 32768.0  # raw -> g

        print("\n===== 开始验证，请依次测试 =====")
        print("  1. 手腕向左/右倾斜   → 应打印导航方向")
        print("  2. 手指敲击戒指两下  → 应打印 [确认键]")
        print("  3. 长按+挥手+松开    → 应打印 [HMM 手势] wave")
        print("  4. 按键双击          → 应打印 [紧急呼救]")
        print("Ctrl+C 退出\n")

        last_nav_ts = 0.0
        try:
            while True:
                batch = await sdk.wait_sensor_data(ring, timeout_s=10.0)
                # 用每批平均加速度估计重力方向，检测左右倾
                n = len(batch.samples)
                if n == 0:
                    continue
                ax = sum(s.accel_x for s in batch.samples) / n * accel_scale
                now = asyncio.get_event_loop().time()
                if now - last_nav_ts >= TILT_COOLDOWN_S:
                    if ax > TILT_THRESHOLD_G:
                        print("👉 [导航] 右倾 → 下一个候选")
                        last_nav_ts = now
                    elif ax < -TILT_THRESHOLD_G:
                        print("👈 [导航] 左倾 → 上一个候选")
                        last_nav_ts = now
        except sdk.TimeoutError:
            print("!! 10 秒未收到 IMU 数据，设备可能被单击切回了录音模式")
        finally:
            try:
                await sdk.stop_sensor_report(ring)
            except sdk.RingSoundError:
                pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="无声之声 Day 0 戒指输入验证")
    parser.add_argument("--address", help="戒指 MAC 地址")
    parser.add_argument("--scan", action="store_true", help="仅扫描设备")
    args = parser.parse_args()

    if args.scan:
        asyncio.run(scan())
    elif args.address:
        try:
            asyncio.run(main(args.address))
        except KeyboardInterrupt:
            print("\n退出")
    else:
        parser.print_help()
        sys.exit(1)
