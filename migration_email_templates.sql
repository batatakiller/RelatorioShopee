-- Criar tabela de templates de e-mail
CREATE TABLE IF NOT EXISTS public.email_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_key TEXT NOT NULL UNIQUE, -- chave de busca, ex: 'office 2024', 'windows', 'office 2016 e 2021'
    name TEXT NOT NULL,
    template_html TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ativar RLS (Row Level Security)
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Permitir acesso livre para a chave anônima (padrão do projeto)
CREATE POLICY "Enable all for anon" ON public.email_templates FOR ALL USING (true) WITH CHECK (true);

-- Inserir templates padrão
INSERT INTO public.email_templates (product_key, name, template_html) VALUES
('office 2024', 'Office 2024', '
      <div style="background-color: #f7fafc; border: 1px solid #edf2f7; border-radius: 6px; padding: 15px; margin: 20px 0; color: #2d3748; line-height: 1.6;">
        <h3 style="color: #4f46e5; margin-top: 0; margin-bottom: 10px; font-size: 16px;">Obrigado por adquirir o Office 2024 Pro Plus!</h3>
        <p style="margin: 5px 0; font-size: 14px;"><strong>Chave:</strong> <span style="font-family: monospace; font-size: 16px; font-weight: bold; color: #e53e3e;">{licenseKey}</span></p>
        <ul style="padding-left: 20px; margin: 10px 0; font-size: 14px; color: #4a5568; list-style-type: none; margin-left: 0; padding-left: 0;">
          <li>• <strong>Licença:</strong> 1 dispositivo (uso vitalício)</li>
          <li>• <strong>Método de Instalação:</strong> Download Digital</li>
        </ul>

        <h4 style="color: #2d3748; margin-top: 20px; font-size: 14px; border-bottom: 1px solid #edf2f7; padding-bottom: 5px;">1. Remova versões anteriores do Office</h4>
        <p style="margin: 5px 0; font-size: 14px; color: #4a5568;">
          Se houver qualquer versão do Office instalada em seu computador — incluindo outras versões do Office 2024 —, desinstale completamente antes de prosseguir.
        </p>
        <p style="margin: 5px 0; font-size: 14px; color: #1a202c; font-weight: bold;">✔️ Isso evita erros e conflitos durante a nova instalação.</p>
        <div style="background-color: #edf2f7; padding: 10px; border-radius: 6px; margin: 10px 0; font-size: 13px; color: #4a5568;">
          <strong>Como desinstalar versões anteriores do Office:</strong><br>
          Abra o Menu Iniciar &gt; Pesquisar <strong>Painel de Controle</strong> &gt; <strong>Programas e Recursos</strong>.<br>
          Encontre <em>Microsoft 365 - pt-br</em> e <em>Microsoft OneNote - pt-br</em>, clique em Desinstalar e siga as instruções.<br>
          Reinicie o computador após a desinstalação.
        </div>

        <h4 style="color: #2d3748; margin-top: 20px; font-size: 14px; border-bottom: 1px solid #edf2f7; padding-bottom: 5px;">2. Reinicie o computador</h4>
        <p style="margin: 5px 0; font-size: 14px; color: #4a5568;">
          Após a desinstalação, reinicie a máquina para que as alterações tenham efeito.
        </p>

        <h4 style="color: #2d3748; margin-top: 20px; font-size: 14px; border-bottom: 1px solid #edf2f7; padding-bottom: 5px;">3. Baixe o Office 2024 Pro Plus</h4>
        <p style="margin: 5px 0; font-size: 14px; color: #4a5568;">
          Acesse o link abaixo e faça o download.
        </p>
        <p style="margin: 10px 0; font-size: 14px; font-weight: bold;">
          👉 <a href="https://supersoftware.info/office/office2024.exe" style="color: #4f46e5; text-decoration: underline;">Clique aqui para baixar</a>
        </p>
        <p style="margin: 5px 0; font-size: 12px; color: #718096; word-break: break-all;">
          (Caso o link não abra, copie o endereço abaixo e cole na barra de sites do seu navegador):<br>
          <code>https://supersoftware.info/office/office2024.exe</code>
        </p>
        <p style="margin: 5px 0; font-size: 13px; color: #718096;">
          <em>Obs.: Ao clicar no link, o download começará automaticamente.</em>
        </p>
        <div style="background-color: #f7fafc; border: 1px dashed #cbd5e0; padding: 10px; border-radius: 6px; margin: 10px 0; font-size: 13px; color: #4a5568;">
          <strong>Após baixar:</strong><br>
          Dê um duplo clique em <strong>''office2024.exe''</strong> para iniciar a instalação.<br>
          Uma janela de instalação será aberta. (Isso pode levar alguns minutos dependendo da sua internet).<br>
          Ao finalizar, clique em Fechar.
        </div>

        <h4 style="color: #2d3748; margin-top: 20px; font-size: 14px; border-bottom: 1px solid #edf2f7; padding-bottom: 5px;">4. Ative o Office (obrigatório)</h4>
        <p style="margin: 5px 0; font-size: 14px; color: #4a5568;">
          Abra o Word.<br>
          Vá em <strong>Arquivo</strong> (ou Ficheiros) &gt; <strong>Conta</strong> &gt; <strong>Alterar chave do produto</strong>.<br>
          Insira a chave de 25 dígitos exibida acima. Feche o Word e abra novamente.
        </p>
        <div style="background-color: #fffaf0; border: 1px solid #feebc8; padding: 12px; border-radius: 6px; margin: 15px 0; font-size: 13px; color: #744210;">
          <strong>⚠️ IMPORTANTE - Ativação por telefone:</strong><br>
          Quando aparecer a tela do Assistente de Ativação:<br>
          • Selecione <strong>"Pretendo ativar o software por telefone"</strong> e clique em Seguinte.<br>
          • Tire uma foto ou captura de tela dessa tela e envie para nós.<br>
          Faremos a ativação para você em segundos!
        </div>

        <h4 style="color: #2d3748; margin-top: 20px; font-size: 14px; border-bottom: 1px solid #edf2f7; padding-bottom: 5px;">5. Confirme a ativação</h4>
        <p style="margin: 5px 0; font-size: 14px; color: #4a5568;">
          Feche todos os programas do Office. Abra o Word novamente, vá em Conta e verifique se aparece a mensagem: <strong>"Produto ativado"</strong>.<br>
          Ative sua chave até 30 dias, conforme recomendação da Microsoft.
        </p>

        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;">

        <div style="font-size: 13px; color: #4a5568; line-height: 1.5;">
          <strong>📞 Suporte Técnico Especializado:</strong><br>
          Teve alguma dificuldade técnica durante o processo? Nossa equipe está à disposição:<br>
          🟢 <strong>Whatsapp: +55 (11) 93585-6950</strong><br><br>
          •/ <strong>Também temos:</strong> Office 365 • Windows 10/11 Pro • CorelDraw • Licenças vitalícias com o melhor custo-benefício.<br>
          Visite: <a href="https://supersoftware.info" style="color: #4f46e5; text-decoration: underline;">supersoftware.info</a>
        </div>
      </div>
'),
('windows', 'Windows 10 / 11', '
      <div style="background-color: #f7fafc; border: 1px solid #edf2f7; border-radius: 6px; padding: 20px; margin: 20px 0; color: #2d3748; line-height: 1.6;">
        <h3 style="color: #4f46e5; margin-top: 0; margin-bottom: 10px; font-size: 16px;">🎉 Instruções para ativação do Windows</h3>
        <p style="margin: 5px 0; font-size: 14px;"><strong>Chave:</strong> <span style="font-family: monospace; font-size: 16px; font-weight: bold; color: #e53e3e;">{licenseKey}</span></p>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;">
        
        <ul style="padding-left: 20px; margin: 15px 0; font-size: 14px; color: #4a5568; line-height: 1.8; list-style-type: none; margin-left: 0; padding-left: 0;">
          <li style="margin-bottom: 8px;">👉 Clique no <strong>Menu Iniciar</strong></li>
          <li style="margin-bottom: 8px;">👉 Vá em <strong>Configurações ⚙️</strong></li>
          <li style="margin-bottom: 8px;">👉 Clique em <strong>Sistema</strong></li>
          <li style="margin-bottom: 8px;">👉 Selecione <strong>Ativação</strong></li>
          <li style="margin-bottom: 8px;">👉 Clique em <strong>Alterar chave do produto</strong></li>
          <li style="margin-bottom: 8px;">👉 Digite a chave do Windows Pro (25 caracteres) indicada acima</li>
          <li style="margin-bottom: 8px;">👉 Clique em <strong>Avançar → Ativar</strong></li>
          <li style="margin-bottom: 8px;">👉 Aguarde a mensagem de ativação concluída ✅</li>
        </ul>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;">
        
        <div style="font-size: 13px; color: #4a5568; line-height: 1.5;">
          <strong>📞 Suporte Técnico Especializado:</strong><br>
          Teve alguma dificuldade técnica durante o processo? Nossa equipe está à disposição:<br>
          🟢 <strong>Whatsapp: +55 (11) 93585-6950</strong><br><br>
          •/ <strong>Também temos:</strong> Office 365 • Windows 10/11 Pro • CorelDraw • Licenças vitalícias com o melhor custo-benefício.<br>
          Visite: <a href="https://supersoftware.info" style="color: #4f46e5; text-decoration: underline;">supersoftware.info</a>
        </div>
      </div>
'),
('office 2016 e 2021', 'Office 2016 / 2021', '
    <div style="background-color: #f7fafc; border: 1px solid #edf2f7; border-radius: 6px; padding: 20px; margin: 20px 0; color: #2d3748; line-height: 1.6;">
      <h3 style="color: #4f46e5; margin-top: 0; margin-bottom: 10px; font-size: 16px;">🎉 Obrigado por comprar a chave do Office!</h3>
      <p style="margin: 5px 0; font-size: 14px;"><strong>Chave:</strong> <span style="font-family: monospace; font-size: 16px; font-weight: bold; color: #e53e3e;">{licenseKey}</span></p>
      <ul style="padding-left: 20px; margin: 10px 0; font-size: 14px; color: #4a5568; list-style-type: none; margin-left: 0; padding-left: 0;">
        <li>• <strong>Método de entrega:</strong> Download Digital</li>
        <li>• <strong>Licença:</strong> 1 Dispositivo</li>
      </ul>
      
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;">
      
      <ol style="padding-left: 20px; margin: 15px 0; font-size: 14px; color: #4a5568; line-height: 1.6;">
        <li style="margin-bottom: 10px;">
          Para instalação e ativação correta, siga estritamente os passos descritos abaixo para que venha a obter êxito em todo o processo de instalação e ativação.
        </li>
        <li style="margin-bottom: 10px;">
          Caso tenha qualquer versão do Office instalado em sua máquina, mesmo que seja uma versão 2021, deverá desinstalá-la completamente.
        </li>
        <li style="margin-bottom: 10px; font-weight: bold; color: #e53e3e;">
          Desinstale seu Office de qualquer versão para evitar erros e conflitos de incompatibilidade.
        </li>
        <li style="margin-bottom: 10px; list-style-type: none; background-color: #edf2f7; padding: 10px; border-radius: 6px; font-size: 13px;">
          <strong>Como desinstalar versões anteriores do Office:</strong><br>
          Abra o Menu Iniciar &gt; Pesquisar <strong>Painel de Controle</strong> &gt; <strong>Programas e Recursos</strong>.<br>
          Encontre <em>Microsoft 365 - pt-br</em> e <em>Microsoft OneNote - pt-br</em>, clique em Desinstalar e siga as instruções.<br>
          Reinicie o computador após a desinstalação.
        </li>
        <li style="margin-bottom: 10px;">
          Baixe o Office no link abaixo: (Obs.: Botão Azul "Download", e depois "FAZER DOWNLOAD ASSIM MESMO")<br>
          👉 <a href="https://bit.ly/MicrosoftOffice2021Pro" style="color: #4f46e5; text-decoration: underline; font-weight: bold;">Clique aqui para baixar o instalador</a>
        </li>
        <li style="margin-bottom: 10px;">
          Clique com o botão direito no arquivo “Office 2021 Pro Plus”, selecione “Abrir com” &gt; “Windows Explorer”, abra a pasta “64bits” e dê um duplo clique em “Instalar” para iniciar a instalação.
        </li>
        <li style="margin-bottom: 10px;">
          Depois de instalado, clique em fechar e abra qualquer aplicativo do Office (exemplo: Word).
        </li>
        <li style="margin-bottom: 10px;">
          Abra o Word e vá em <strong>Arquivo</strong> &gt; <strong>Conta</strong> &gt; <strong>Alterar chave do produto</strong>.<br>
          Insira a chave de 25 dígitos indicada acima e depois clique em <strong>Ativar</strong>.
        </li>
        <li style="margin-bottom: 10px;">
          Clique em fechar, encerre o aplicativo e abra-o novamente (exemplo: Word).
        </li>
        <li style="margin-bottom: 10px;">
          Abrirá uma janela do <strong>ASSISTENTE PARA ATIVAÇÃO</strong>, clique no botão "Avançar". Sua chave de produto agora está ativada em seu computador!
        </li>
      </ol>
      
      <div style="background-color: #e6fffa; border: 1px solid #b2f5ea; padding: 10px; border-radius: 6px; margin: 15px 0; font-size: 13px; color: #0d9488; text-align: center; font-weight: bold;">
        OBS: Feche tudo e abra novamente o Word, clique em CONTA para ver a mensagem "PRODUTO ATIVADO"
      </div>
      
      <ul style="padding-left: 20px; font-size: 13px; color: #4a5568; margin-top: 15px;">
        <li>📌 Recomendamos ativar o produto em até 7 dias após o recebimento.</li>
        <li>📩 Qualquer dúvida, fale conosco antes de abrir reclamação.</li>
        <li>✅ Oferecemos suporte gratuito à instalação.</li>
      </ul>
      
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">

      <div style="font-size: 13px; color: #4a5568; line-height: 1.5;">
        <strong>📞 Suporte Técnico Especializado:</strong><br>
        Teve alguma dificuldade técnica durante o processo? Nossa equipe está à disposição:<br>
        🟢 <strong>Whatsapp: +55 (11) 93585-6950</strong><br><br>
        •/ <strong>Também temos:</strong> Office 365 • Windows 10/11 Pro • CorelDraw • Licenças vitalícias com o melhor custo-benefício.<br>
        Visite: <a href="https://supersoftware.info" style="color: #4f46e5; text-decoration: underline;">supersoftware.info</a>
      </div>
    </div>
')
ON CONFLICT (product_key) DO UPDATE SET template_html = EXCLUDED.template_html;
