'use strict';

TABS.setup = {
    yaw_fix: 0.0
};

TABS.setup.initialize = function (callback) {
    const self = this;

    if (GUI.active_tab != 'setup') {
        GUI.active_tab = 'setup';
    }

    function load_status() {
        MSP.send_message(MSPCodes.MSP_STATUS, false, false, load_html);
    }

    function load_html() {
        $('#content').load("./tabs/setup.html", process_html);
    }

    load_status();

    function process_html() {
        // translate to user-selected language
        i18n.localizePage();

        const backupButton = $('#content .backup');

        if (semver.lt(FC.CONFIG.apiVersion, CONFIGURATOR.API_VERSION_MIN_SUPPORTED_BACKUP_RESTORE)) {
            backupButton.addClass('disabled');
            $('#content .restore').addClass('disabled');

            GUI.log(i18n.getMessage('initialSetupBackupAndRestoreApiVersion', [FC.CONFIG.apiVersion, CONFIGURATOR.API_VERSION_MIN_SUPPORTED_BACKUP_RESTORE]));
        }

        // saving and uploading an imaginary config to hardware is a bad idea
        if (CONFIGURATOR.virtualMode) {
            backupButton.addClass('disabled');
        }

        // check if we have accelerometer and magnetometer
        if (!have_sensor(FC.CONFIG.activeSensors, 'acc')) {
            $('a.calibrateAccel').addClass('disabled');
            $('default_btn').addClass('disabled');
        }

        if (!have_sensor(FC.CONFIG.activeSensors, 'mag')) {
            $('a.calibrateMag').addClass('disabled');
            $('default_btn').addClass('disabled');
        }

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_40)) {
            if (isExpertModeEnabled()) {
                $('.initialSetupRebootBootloader').show();
            } else {
                $('.initialSetupRebootBootloader').hide();
            }

            $('a.rebootBootloader').click(function () {
                const buffer = [];
                buffer.push(mspHelper.REBOOT_TYPES.BOOTLOADER);
                MSP.send_message(MSPCodes.MSP_SET_REBOOT, buffer, false);
            });
        } else {
            $('.initialSetupRebootBootloader').hide();
        }

        // UI Hooks
        $('a.calibrateAccel').click(function () {
            const _self = $(this);

            if (!_self.hasClass('calibrating')) {
                _self.addClass('calibrating');

                // During this period MCU won't be able to process any serial commands because its locked in a for/while loop
                // until this operation finishes, sending more commands through data_poll() will result in serial buffer overflow
                GUI.interval_pause('setup_data_pull');
                MSP.send_message(MSPCodes.MSP_ACC_CALIBRATION, false, false, function () {
                    GUI.log(i18n.getMessage('initialSetupAccelCalibStarted'));
                    $('#accel_calib_running').show();
                    $('#accel_calib_rest').hide();
                });

                GUI.timeout_add('button_reset', function () {
                    GUI.interval_resume('setup_data_pull');

                    GUI.log(i18n.getMessage('initialSetupAccelCalibEnded'));
                    _self.removeClass('calibrating');
                    $('#accel_calib_running').hide();
                    $('#accel_calib_rest').show();
                }, 2000);
            }
        });

        $('a.calibrateMag').click(function () {
            const _self = $(this);

            if (!_self.hasClass('calibrating') && !_self.hasClass('disabled')) {
                _self.addClass('calibrating');

                MSP.send_message(MSPCodes.MSP_MAG_CALIBRATION, false, false, function () {
                    GUI.log(i18n.getMessage('initialSetupMagCalibStarted'));
                    $('#mag_calib_running').show();
                    $('#mag_calib_rest').hide();
                });

                GUI.timeout_add('button_reset', function () {
                    GUI.log(i18n.getMessage('initialSetupMagCalibEnded'));
                    _self.removeClass('calibrating');
                    $('#mag_calib_running').hide();
                    $('#mag_calib_rest').show();
                }, 30000);
            }
        });

        const dialogConfirmReset = $('.dialogConfirmReset')[0];

        $('a.resetSettings').click(function () {
            dialogConfirmReset.showModal();
        });

        $('.dialogConfirmReset-cancelbtn').click(function() {
            dialogConfirmReset.close();
        });

        $('.dialogConfirmReset-confirmbtn').click(function() {
            dialogConfirmReset.close();
            MSP.send_message(MSPCodes.MSP_RESET_CONF, false, false, function () {
                GUI.log(i18n.getMessage('initialSetupSettingsRestored'));

                GUI.tab_switch_cleanup(function () {
                    TABS.setup.initialize();
                });
            });
        });

        backupButton.click(function () {
            if ($(this).hasClass('disabled')) {
                return;
            }

            configuration_backup(function () {
                GUI.log(i18n.getMessage('initialSetupBackupSuccess'));
            });
        });

        $('#content .restore').click(function () {
            if ($(this).hasClass('disabled')) {
                return;
            }

            configuration_restore(function () {
                // get latest settings
                TABS.setup.initialize();

                GUI.log(i18n.getMessage('initialSetupRestoreSuccess'));
            });
        });

        $('a.rebootMsc').click(function () {
            const buffer = [];
            if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_41) &&
                GUI.operating_system === "Linux") {
                   // Reboot into MSC using UTC time offset instead of user timezone
                   // Linux seems to expect that the FAT file system timestamps are UTC based
                buffer.push(mspHelper.REBOOT_TYPES.MSC_UTC);
            } else {
                buffer.push(mspHelper.REBOOT_TYPES.MSC);
            }
            MSP.send_message(MSPCodes.MSP_SET_REBOOT, buffer, false);
        });

        GUI.content_ready(callback);
    }
};

TABS.setup.cleanup = function (callback) {
    if (callback) callback();
};
