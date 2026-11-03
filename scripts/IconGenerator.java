import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import java.io.File;

public class IconGenerator {
    static final int S = 512;

    static void drawPerson(Graphics2D g) {
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        // Body
        g.setColor(new Color(40, 190, 210));
        g.fill(new RoundRectangle2D.Float(112, 300, 220, 205, 90, 90));

        // Neck
        g.setColor(new Color(225, 160, 112));
        g.fillRoundRect(205, 245, 80, 85, 28, 28);

        // Face
        g.setColor(new Color(238, 184, 137));
        g.fillOval(165, 105, 160, 175);

        // Helmet
        g.setColor(new Color(255, 190, 45));
        g.fill(new Arc2D.Float(145, 65, 200, 150, 0, 180, Arc2D.PIE));
        g.fillRoundRect(135, 155, 220, 32, 16, 16);
        g.setColor(new Color(255, 220, 125));
        g.fillRoundRect(228, 78, 28, 85, 12, 12);

        // Eyes
        g.setColor(new Color(40, 48, 65));
        g.fillOval(205, 190, 12, 15);
        g.fillOval(275, 190, 12, 15);

        // Clipboard
        g.setColor(Color.WHITE);
        g.fillRoundRect(315, 265, 135, 170, 20, 20);
        g.setColor(new Color(28, 48, 78));
        g.fillRoundRect(350, 250, 65, 30, 10, 10);

        // Check mark
        g.setColor(new Color(20, 170, 125));
        g.setStroke(new BasicStroke(17, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        Path2D check = new Path2D.Float();
        check.moveTo(345, 345);
        check.lineTo(375, 375);
        check.lineTo(425, 320);
        g.draw(check);

        g.setColor(new Color(90, 110, 130));
        g.setStroke(new BasicStroke(8, BasicStroke.CAP_ROUND));
        g.drawLine(345, 405, 420, 405);
    }

    static BufferedImage render(int size, boolean background) {
        BufferedImage img = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.scale(size / 512.0, size / 512.0);

        if (background) {
            g.setPaint(new GradientPaint(0, 0, new Color(13, 27, 54),
                    512, 512, new Color(25, 65, 105)));
            g.fillRoundRect(0, 0, 512, 512, 110, 110);

            g.setColor(new Color(255, 255, 255, 18));
            g.fillOval(330, -90, 260, 260);
            g.fillOval(-100, 370, 240, 240);
        }

        drawPerson(g);
        g.dispose();
        return img;
    }

    public static void main(String[] args) throws Exception {
        File res = new File(args[0]);

        String[] folders = {"mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"};
        int[] sizes = {48, 72, 96, 144, 192};

        for (int i = 0; i < folders.length; i++) {
            File dir = new File(res, "mipmap-" + folders[i]);
            dir.mkdirs();
            BufferedImage icon = render(sizes[i], true);
            ImageIO.write(icon, "png", new File(dir, "ic_launcher.png"));
            ImageIO.write(icon, "png", new File(dir, "ic_launcher_round.png"));
        }

        File drawable = new File(res, "drawable-nodpi");
        drawable.mkdirs();
        ImageIO.write(render(432, false), "png",
                new File(drawable, "ic_launcher_foreground.png"));

        File adaptive = new File(res, "mipmap-anydpi-v26");
        adaptive.mkdirs();

        String xml =
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n" +
            "<adaptive-icon xmlns:android=\"http://schemas.android.com/apk/res/android\">\n" +
            "    <background android:drawable=\"@color/ic_launcher_background\" />\n" +
            "    <foreground android:drawable=\"@drawable/ic_launcher_foreground\" />\n" +
            "</adaptive-icon>\n";

        java.nio.file.Files.writeString(
            new File(adaptive, "ic_launcher.xml").toPath(), xml);
        java.nio.file.Files.writeString(
            new File(adaptive, "ic_launcher_round.xml").toPath(), xml);

        File colors = new File(res, "values");
        colors.mkdirs();
        java.nio.file.Files.writeString(
            new File(colors, "ic_launcher_colors.xml").toPath(),
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n" +
            "<resources><color name=\"ic_launcher_background\">#101F3D</color></resources>\n");

        System.out.println("تم إنشاء أيقونات Android بنجاح.");
    }
}
