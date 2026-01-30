import { AlertTriangle, X, ShieldAlert, ArrowRight } from 'lucide-react';
import './GoogleDisclaimerModal.css';

interface GoogleDisclaimerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export function GoogleDisclaimerModal({ isOpen, onClose, onConfirm }: GoogleDisclaimerModalProps) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content disclaimer-modal">
                <button className="modal-close" onClick={onClose}>
                    <X size={20} />
                </button>

                <div className="modal-header">
                    <div className="modal-icon-wrapper">
                        <ShieldAlert size={48} className="text-warning" />
                    </div>
                    <h2>Important Safety Notice</h2>
                </div>

                <div className="modal-body">
                    <p className="highlight-text">
                        We are currently in the process of getting Google's official safety approval.
                    </p>

                    <p>
                        While we wait for verification, you will see a warning screen when connecting your account.
                        This is normal for apps in "Testing Mode".
                    </p>

                    <div className="steps-guide">
                        <h4>How to proceed safely:</h4>
                        <ol>
                            <li>
                                On the warning screen, look for <strong>"Advanced"</strong>
                                <span className="helper-text">(usually on the left)</span>
                            </li>
                            <li>
                                Click it to expand more options.
                            </li>
                            <li>
                                Click <strong>"Go to SyncHub (unsafe)"</strong>
                                <span className="helper-text">(at the bottom)</span>
                            </li>
                        </ol>
                    </div>

                    <div className="safety-note">
                        <AlertTriangle size={16} />
                        <span>Rest assured, your data is completely safe. We only access the specific sheets you choose to sync.</span>
                    </div>
                </div>

                <div className="modal-actions">
                    <button className="btn btn-ghost" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" onClick={onConfirm}>
                        I Understand, Connect
                        <ArrowRight size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
