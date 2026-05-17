using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using LibreHardwareMonitor.Hardware;

public class UpdateVisitor : IVisitor
{
    public void VisitComputer(IComputer computer) => computer.Traverse(this);
    public void VisitHardware(IHardware hardware)
    {
        hardware.Update();
        foreach (IHardware sub in hardware.SubHardware) sub.Accept(this);
    }
    public void VisitSensor(ISensor sensor) { }
    public void VisitParameter(IParameter parameter) { }
}

class Program
{
    static Computer? _computer;

    static void Main(string[] args)
    {
        bool debug = args.Any(a => a == "--debug");
        bool daemon = args.Any(a => a == "--daemon");

        if (daemon)
        {
            RunDaemon();
        }
        else
        {
            RunOnce(debug);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  DAEMON MODE — persistent process, JSON IPC via stdin/stdout
    // ═══════════════════════════════════════════════════════════
    static void RunDaemon()
    {
        // Safety: revert all fans on exit
        AppDomain.CurrentDomain.ProcessExit += (_, _) => SafeResetAll();
        Console.CancelKeyPress += (_, e) => { e.Cancel = true; SafeResetAll(); Environment.Exit(0); };

        try
        {
            _computer = new Computer
            {
                IsCpuEnabled = true,
                IsGpuEnabled = true,
                IsMemoryEnabled = false,
                IsMotherboardEnabled = true,
                IsControllerEnabled = true,
                IsStorageEnabled = false
            };
            _computer.Open();
            _computer.Accept(new UpdateVisitor());

            // Send ready signal
            SendJson(new { type = "ready", isAdmin = IsRunningAsAdmin() });

            // Main command loop — read JSON commands from stdin
            string? line;
            while ((line = Console.ReadLine()) != null)
            {
                line = line.Trim();
                if (string.IsNullOrEmpty(line)) continue;

                try
                {
                    using var doc = JsonDocument.Parse(line);
                    var root = doc.RootElement;
                    var cmd = root.GetProperty("cmd").GetString() ?? "";

                    switch (cmd)
                    {
                        case "get-data":
                            HandleGetData();
                            break;
                        case "set-fan":
                            HandleSetFan(root);
                            break;
                        case "set-fan-default":
                            HandleSetFanDefault(root);
                            break;
                        case "set-all-default":
                            ResetAllControls();
                            SendJson(new { type = "ok", cmd = "set-all-default" });
                            break;
                        case "exit":
                            ResetAllControls();
                            SendJson(new { type = "ok", cmd = "exit" });
                            _computer?.Close();
                            return;
                        default:
                            SendJson(new { type = "error", message = $"Unknown command: {cmd}" });
                            break;
                    }
                }
                catch (Exception ex)
                {
                    SendJson(new { type = "error", message = ex.Message });
                }
            }

            // stdin closed — clean up
            ResetAllControls();
            _computer?.Close();
        }
        catch (Exception ex)
        {
            SendJson(new { type = "fatal", message = ex.Message, stack = ex.StackTrace });
            SafeResetAll();
        }
    }

    static void HandleGetData()
    {
        if (_computer == null) return;
        _computer.Accept(new UpdateVisitor());

        var result = new Dictionary<string, object?>();

        // ─── CPU ───
        var cpuData = new Dictionary<string, object?>();
        var cpuClocks = new List<float?>();
        var cpuCores = new List<float?>();
        float? cpuPackage = null;
        float? cpuPower = null;

        // ─── GPU ───
        var gpuData = new Dictionary<string, object?>();

        // ─── Temps ───
        var temps = new List<Dictionary<string, object?>>();

        // ─── Fans + Controls ───
        var fans = new List<Dictionary<string, object?>>();

        foreach (var hw in _computer.Hardware)
        {
            // CPU
            if (hw.HardwareType == HardwareType.Cpu)
            {
                cpuData["name"] = hw.Name;
                foreach (var s in hw.Sensors)
                {
                    if (s.SensorType == SensorType.Temperature)
                    {
                        if (s.Name.Contains("Package", StringComparison.OrdinalIgnoreCase) ||
                            s.Name.Contains("Tctl", StringComparison.OrdinalIgnoreCase))
                            cpuPackage = s.Value.HasValue ? (float?)Math.Round(s.Value.Value, 1) : null;
                        else if (s.Name.Contains("Core", StringComparison.OrdinalIgnoreCase))
                            cpuCores.Add(s.Value.HasValue ? (float?)Math.Round(s.Value.Value, 1) : null);
                    }
                    else if (s.SensorType == SensorType.Clock && s.Name.Contains("Core", StringComparison.OrdinalIgnoreCase))
                    {
                        cpuClocks.Add(s.Value.HasValue ? (float?)Math.Round(s.Value.Value) : null);
                    }
                    else if (s.SensorType == SensorType.Power && s.Name.Contains("Package", StringComparison.OrdinalIgnoreCase))
                    {
                        cpuPower = s.Value.HasValue ? (float?)Math.Round(s.Value.Value, 1) : null;
                    }
                }
            }

            // GPU
            if (hw.HardwareType == HardwareType.GpuNvidia ||
                hw.HardwareType == HardwareType.GpuAmd ||
                hw.HardwareType == HardwareType.GpuIntel)
            {
                gpuData["name"] = hw.Name;
                foreach (var s in hw.Sensors)
                {
                    if (s.SensorType == SensorType.Temperature)
                    {
                        if (s.Name == "GPU Core") gpuData["temp"] = s.Value.HasValue ? Math.Round(s.Value.Value, 1) : null;
                        if (s.Name == "GPU Hot Spot") gpuData["hotspot"] = s.Value.HasValue ? Math.Round(s.Value.Value, 1) : null;
                    }
                    else if (s.SensorType == SensorType.Clock)
                    {
                        if (s.Name == "GPU Core") gpuData["coreClock"] = s.Value.HasValue ? Math.Round(s.Value.Value) : null;
                        if (s.Name == "GPU Memory") gpuData["memClock"] = s.Value.HasValue ? Math.Round(s.Value.Value) : null;
                    }
                    else if (s.SensorType == SensorType.Load && s.Name == "GPU Core")
                        gpuData["load"] = s.Value.HasValue ? Math.Round(s.Value.Value, 1) : null;
                    else if (s.SensorType == SensorType.Power && s.Name.Contains("Package", StringComparison.OrdinalIgnoreCase))
                        gpuData["power"] = s.Value.HasValue ? Math.Round(s.Value.Value, 1) : null;
                    else if (s.SensorType == SensorType.SmallData)
                    {
                        if (s.Name.Contains("Memory Used", StringComparison.OrdinalIgnoreCase) && !s.Name.Contains("D3D"))
                            gpuData["vramUsed"] = s.Value.HasValue ? Math.Round(s.Value.Value) : null;
                        if (s.Name.Contains("Memory Total", StringComparison.OrdinalIgnoreCase))
                            gpuData["vramTotal"] = s.Value.HasValue ? Math.Round(s.Value.Value) : null;
                    }
                }
            }

            // Collect ALL fans + controls from this hw and sub-hw
            CollectFansAndControls(hw, fans);
            foreach (var sub in hw.SubHardware)
            {
                CollectFansAndControls(sub, fans);
            }

            // Collect ALL temps for the dashboard
            CollectTemps(hw, temps);
            foreach (var sub in hw.SubHardware)
            {
                CollectTemps(sub, temps);
            }
        }

        cpuData["package"] = cpuPackage;
        cpuData["cores"] = cpuCores;
        cpuData["clocks"] = cpuClocks;
        cpuData["power"] = cpuPower;

        result["type"] = "data";
        result["cpu"] = cpuData;
        result["gpu"] = gpuData;
        result["fans"] = fans;
        result["temps"] = temps;

        SendJson(result);
    }

    /// <summary>
    /// Collect Fan RPM sensors AND their linked Control sensors.
    /// Builds combined fan cards with both RPM reading and control capability.
    /// </summary>
    static void CollectFansAndControls(IHardware hw, List<Dictionary<string, object?>> fans)
    {
        // First pass: gather all Fan RPM sensors
        var fanSensors = hw.Sensors.Where(s => s.SensorType == SensorType.Fan).ToList();
        // Second pass: gather all Control sensors (fan duty %)
        var controlSensors = hw.Sensors.Where(s => s.SensorType == SensorType.Control).ToList();

        // Match Fan sensors with their Control counterparts by index
        foreach (var fanSensor in fanSensors)
        {
            var entry = new Dictionary<string, object?>
            {
                ["name"] = fanSensor.Name,
                ["hw"] = hw.Name,
                ["rpm"] = fanSensor.Value.HasValue ? (int)Math.Round(fanSensor.Value.Value) : 0
            };

            // Try to find matching control by name pattern
            // Fan sensors: "Fan #1", Controls: "Fan Control #1"
            var matchingControl = controlSensors.FirstOrDefault(c =>
                c.Name.Contains(fanSensor.Name.Replace("Fan", "").Trim(), StringComparison.OrdinalIgnoreCase) ||
                c.Name.Contains(fanSensor.Name, StringComparison.OrdinalIgnoreCase) ||
                (fanSensor.Index == c.Index));

            if (matchingControl?.Control != null)
            {
                entry["id"] = matchingControl.Identifier.ToString();
                entry["control"] = matchingControl.Value.HasValue ? Math.Round(matchingControl.Value.Value, 1) : 0;
                entry["mode"] = matchingControl.Control.ControlMode.ToString().ToLower();
                entry["min"] = matchingControl.Control.MinSoftwareValue;
                entry["max"] = matchingControl.Control.MaxSoftwareValue;
                entry["canControl"] = true;
            }
            else
            {
                entry["id"] = fanSensor.Identifier.ToString();
                entry["control"] = null;
                entry["mode"] = "default";
                entry["min"] = 0;
                entry["max"] = 100;
                entry["canControl"] = false;
            }

            fans.Add(entry);
        }

        // Also add orphan Control sensors that don't have a matching Fan RPM sensor
        // (e.g. GPU fan control without RPM reading)
        foreach (var ctrl in controlSensors)
        {
            bool alreadyMatched = fans.Any(f =>
                f.ContainsKey("id") && f["id"]?.ToString() == ctrl.Identifier.ToString());
            if (!alreadyMatched && ctrl.Control != null)
            {
                fans.Add(new Dictionary<string, object?>
                {
                    ["name"] = ctrl.Name,
                    ["hw"] = hw.Name,
                    ["rpm"] = null,
                    ["id"] = ctrl.Identifier.ToString(),
                    ["control"] = ctrl.Value.HasValue ? Math.Round(ctrl.Value.Value, 1) : 0,
                    ["mode"] = ctrl.Control.ControlMode.ToString().ToLower(),
                    ["min"] = ctrl.Control.MinSoftwareValue,
                    ["max"] = ctrl.Control.MaxSoftwareValue,
                    ["canControl"] = true
                });
            }
        }
    }

    static void CollectTemps(IHardware hw, List<Dictionary<string, object?>> temps)
    {
        foreach (var s in hw.Sensors)
        {
            if (s.SensorType == SensorType.Temperature && s.Value.HasValue && s.Value.Value > 0 && s.Value.Value < 150)
            {
                temps.Add(new Dictionary<string, object?>
                {
                    ["name"] = s.Name,
                    ["value"] = Math.Round(s.Value.Value, 1),
                    ["hw"] = hw.Name
                });
            }
        }
    }

    static void HandleSetFan(JsonElement root)
    {
        var id = root.GetProperty("id").GetString() ?? "";
        var value = root.GetProperty("value").GetSingle();

        // Safety floor: never go below 20%
        value = Math.Max(20f, Math.Min(100f, value));

        var sensor = FindControlSensor(id);
        if (sensor?.Control != null)
        {
            sensor.Control.SetSoftware(value);
            SendJson(new { type = "ok", cmd = "set-fan", id, value });
        }
        else
        {
            SendJson(new { type = "error", message = $"Control not found: {id}" });
        }
    }

    static void HandleSetFanDefault(JsonElement root)
    {
        var id = root.GetProperty("id").GetString() ?? "";
        var sensor = FindControlSensor(id);
        if (sensor?.Control != null)
        {
            sensor.Control.SetDefault();
            SendJson(new { type = "ok", cmd = "set-fan-default", id });
        }
        else
        {
            SendJson(new { type = "error", message = $"Control not found: {id}" });
        }
    }

    static ISensor? FindControlSensor(string id)
    {
        if (_computer == null) return null;
        foreach (var hw in _computer.Hardware)
        {
            var found = hw.Sensors.FirstOrDefault(s => s.Identifier.ToString() == id && s.Control != null);
            if (found != null) return found;
            foreach (var sub in hw.SubHardware)
            {
                found = sub.Sensors.FirstOrDefault(s => s.Identifier.ToString() == id && s.Control != null);
                if (found != null) return found;
            }
        }
        return null;
    }

    static void ResetAllControls()
    {
        if (_computer == null) return;
        foreach (var hw in _computer.Hardware)
        {
            ResetHwControls(hw);
            foreach (var sub in hw.SubHardware)
                ResetHwControls(sub);
        }
    }

    static void ResetHwControls(IHardware hw)
    {
        foreach (var sensor in hw.Sensors)
        {
            if (sensor.Control != null && sensor.Control.ControlMode == ControlMode.Software)
            {
                try { sensor.Control.SetDefault(); } catch { }
            }
        }
    }

    static void SafeResetAll()
    {
        try { ResetAllControls(); _computer?.Close(); } catch { }
    }

    static void SendJson(object obj)
    {
        Console.WriteLine(JsonSerializer.Serialize(obj));
        Console.Out.Flush();
    }

    // ═══════════════════════════════════════════════════════════
    //  ONE-SHOT MODE — legacy backward compatible
    // ═══════════════════════════════════════════════════════════
    static void RunOnce(bool debug)
    {
        try
        {
            var computer = new Computer
            {
                IsCpuEnabled = true,
                IsGpuEnabled = true,
                IsMemoryEnabled = false,
                IsMotherboardEnabled = true,
                IsControllerEnabled = true,
                IsStorageEnabled = false
            };
            computer.Open();
            computer.Accept(new UpdateVisitor());

            var result = new Dictionary<string, object?>();
            var cores = new List<float?>();
            var fans = new List<Dictionary<string, object?>>();
            var gpuFans = new List<Dictionary<string, object?>>();
            var allTemps = new List<Dictionary<string, object?>>(); // Debug

            foreach (var hw in computer.Hardware)
            {
                if (debug)
                {
                    foreach (var sensor in hw.Sensors)
                    {
                        allTemps.Add(new Dictionary<string, object?>
                        {
                            ["hw"] = hw.Name,
                            ["hwType"] = hw.HardwareType.ToString(),
                            ["name"] = sensor.Name,
                            ["type"] = sensor.SensorType.ToString(),
                            ["value"] = sensor.Value
                        });
                    }
                    foreach (var sub in hw.SubHardware)
                    {
                        sub.Update();
                        foreach (var sensor in sub.Sensors)
                        {
                            allTemps.Add(new Dictionary<string, object?>
                            {
                                ["hw"] = $"{hw.Name} > {sub.Name}",
                                ["hwType"] = sub.HardwareType.ToString(),
                                ["name"] = sensor.Name,
                                ["type"] = sensor.SensorType.ToString(),
                                ["value"] = sensor.Value
                            });
                        }
                    }
                }

                // Collect Fan RPM
                CollectFansLegacy(hw, fans);
                foreach (var sub in hw.SubHardware)
                    CollectFansLegacy(sub, fans);

                // GPU fan %
                if (hw.HardwareType == HardwareType.GpuNvidia ||
                    hw.HardwareType == HardwareType.GpuAmd ||
                    hw.HardwareType == HardwareType.GpuIntel)
                {
                    foreach (var sensor in hw.Sensors)
                    {
                        if (sensor.SensorType == SensorType.Control &&
                            sensor.Name.Contains("Fan", StringComparison.OrdinalIgnoreCase))
                        {
                            gpuFans.Add(new Dictionary<string, object?>
                            {
                                ["hardware"] = hw.Name,
                                ["name"] = sensor.Name,
                                ["percent"] = sensor.Value.HasValue ? Math.Round(sensor.Value.Value, 1) : null
                            });
                        }
                    }
                }

                // CPU Temperature
                if (hw.HardwareType == HardwareType.Cpu)
                {
                    result["name"] = hw.Name;
                    var tempSensors = hw.Sensors.Where(s => s.SensorType == SensorType.Temperature).ToList();
                    foreach (var sub in hw.SubHardware)
                    {
                        sub.Update();
                        tempSensors.AddRange(sub.Sensors.Where(s => s.SensorType == SensorType.Temperature));
                    }
                    foreach (var sensor in tempSensors)
                    {
                        if (sensor.Name.Contains("Package", StringComparison.OrdinalIgnoreCase) ||
                            sensor.Name.Contains("Tctl", StringComparison.OrdinalIgnoreCase) ||
                            sensor.Name.Contains("Tdie", StringComparison.OrdinalIgnoreCase))
                            result["package"] = sensor.Value;
                        else if (sensor.Name.Contains("Core", StringComparison.OrdinalIgnoreCase) ||
                                 sensor.Name.Contains("CCD", StringComparison.OrdinalIgnoreCase))
                            cores.Add(sensor.Value);
                        else if (sensor.Name.Contains("Max", StringComparison.OrdinalIgnoreCase))
                            result["max"] = sensor.Value;
                    }
                    if ((!result.ContainsKey("package") || result["package"] == null) && tempSensors.Any())
                    {
                        var anyValid = tempSensors
                            .Where(s => s.Value.HasValue && s.Value.Value > 0 && s.Value.Value < 120)
                            .OrderByDescending(s => s.Value)
                            .FirstOrDefault();
                        if (anyValid != null) { result["package"] = anyValid.Value; result["packageSource"] = anyValid.Name; }
                    }
                }
            }

            result["cores"] = cores;
            result["fans"] = fans;
            result["gpuFans"] = gpuFans;

            // Fallback: motherboard CPU temp
            if (!result.ContainsKey("package") || result["package"] == null)
            {
                foreach (var hw in computer.Hardware)
                {
                    if (hw.HardwareType == HardwareType.Motherboard)
                    {
                        foreach (var sub in hw.SubHardware)
                        {
                            sub.Update();
                            var cpuTemp = sub.Sensors
                                .Where(s => s.SensorType == SensorType.Temperature &&
                                    (s.Name.Contains("CPU", StringComparison.OrdinalIgnoreCase) ||
                                     s.Name.Contains("Core", StringComparison.OrdinalIgnoreCase)))
                                .FirstOrDefault(s => s.Value.HasValue && s.Value.Value > 0);
                            if (cpuTemp != null)
                            { result["package"] = cpuTemp.Value; result["packageSource"] = $"MB:{cpuTemp.Name}"; break; }
                        }
                    }
                    if (result.ContainsKey("package") && result["package"] != null) break;
                }
            }

            // Final fallback: core average
            if (!result.ContainsKey("package") || result["package"] == null)
            {
                var validCores = cores.Where(c => c.HasValue && c.Value > 0).ToList();
                if (validCores.Any()) { result["package"] = validCores.Average(c => c!.Value); result["packageSource"] = "core_avg"; }
            }

            if (debug)
            {
                result["_allSensors"] = allTemps;
                result["_isAdmin"] = IsRunningAsAdmin();
            }

            Console.WriteLine(JsonSerializer.Serialize(result));
            computer.Close();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.Message);
            Console.WriteLine(JsonSerializer.Serialize(new { error = ex.Message, stack = ex.StackTrace }));
        }
    }

    static void CollectFansLegacy(IHardware hw, List<Dictionary<string, object?>> fans)
    {
        foreach (var sensor in hw.Sensors)
        {
            if (sensor.SensorType == SensorType.Fan && sensor.Value.HasValue)
            {
                fans.Add(new Dictionary<string, object?>
                {
                    ["hardware"] = hw.Name,
                    ["name"] = sensor.Name,
                    ["rpm"] = Math.Round(sensor.Value.Value)
                });
            }
        }
    }

    static bool IsRunningAsAdmin()
    {
        try
        {
            var identity = System.Security.Principal.WindowsIdentity.GetCurrent();
            var principal = new System.Security.Principal.WindowsPrincipal(identity);
            return principal.IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
        }
        catch { return false; }
    }
}
